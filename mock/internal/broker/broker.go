// Package broker serves the account/order axis: the 12 broker endpoints (orders, money,
// live account reads, durable account reads).
//
// Skeleton behaviour (no market realism): responses are valid, correctly-shaped placeholder
// data. Two rules from the contract ARE enforced:
//   - live reads (/balance, /positions, /orders, /observation) and orders need an active
//     session: 409 otherwise (live reads use the {"error"} envelope, orders the {"reason"} one);
//   - durable reads (/trades, /pnl, /costs*) are 200 incl. empty — never 404/409/504.
//
// Nothing is simulated: a placed order does not appear in /v1/account/orders.
package broker

import (
	"fmt"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/catalog"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/httpx"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/store"
)

type handler struct {
	sessions *store.Sessions
	orderSeq atomic.Int64
}

func (h *handler) nextOrderID(accountID string) string {
	return fmt.Sprintf("%s:%d", accountID, h.orderSeq.Add(1))
}

// Register mounts the broker routes on mux.
func Register(mux *http.ServeMux, sessions *store.Sessions) {
	h := &handler{sessions: sessions}
	// orders
	mux.HandleFunc("/v1/orders", httpx.Method(http.MethodPost, h.place))
	mux.HandleFunc("/v1/orders/cancel", httpx.Method(http.MethodPost, h.cancel))
	mux.HandleFunc("/v1/orders/modify", httpx.Method(http.MethodPost, h.modify))
	// money
	mux.HandleFunc("/v1/account/transfer", httpx.Method(http.MethodPost, h.transfer))
	// live account reads
	mux.HandleFunc("/v1/account/balance", httpx.Method(http.MethodGet, h.balance))
	mux.HandleFunc("/v1/account/positions", httpx.Method(http.MethodGet, h.positions))
	mux.HandleFunc("/v1/account/orders", httpx.Method(http.MethodGet, h.orders))
	mux.HandleFunc("/v1/account/observation", httpx.Method(http.MethodGet, h.observation))
	// durable account reads
	mux.HandleFunc("/v1/account/trades", httpx.Method(http.MethodGet, h.trades))
	mux.HandleFunc("/v1/account/pnl", httpx.Method(http.MethodGet, h.pnl))
	mux.HandleFunc("/v1/account/costs", httpx.Method(http.MethodGet, h.costs))
	mux.HandleFunc("/v1/account/costs/summary", httpx.Method(http.MethodGet, h.costsSummary))
}

// liveAccount validates account_id and requires an active session. Live reads answer 409
// (error envelope) when the account is in no session.
func (h *handler) liveAccount(w http.ResponseWriter, r *http.Request) (string, bool) {
	acct, ok := httpx.RequireQuery(w, r, "account_id")
	if !ok {
		return "", false
	}
	if !h.sessions.Active(acct) {
		httpx.WriteError(w, http.StatusConflict, "no live session for this account")
		return "", false
	}
	return acct, true
}

// ---------------------------------------------------------------- orders

func (h *handler) place(w http.ResponseWriter, r *http.Request) {
	var req api.PlaceOrderRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	// 400: malformed (missing identity, unknown tif).
	if req.AccountId == "" || req.Instrument == "" {
		httpx.WriteError(w, http.StatusBadRequest, "account_id and instrument are required")
		return
	}
	switch req.Tif {
	case api.Gtc, api.Ioc, api.Fok: // FOK is accepted on the wire (the exchange rejects it today)
	default:
		httpx.WriteError(w, http.StatusBadRequest, "tif must be one of gtc, ioc, fok")
		return
	}
	// 409: no live session.
	if !h.sessions.Active(req.AccountId) {
		httpx.WriteReason(w, http.StatusConflict, "no_session")
		return
	}
	// 422: business rejects, reason envelope.
	_, known := catalog.Lookup(req.Instrument)
	switch {
	case !known:
		httpx.WriteReason(w, http.StatusUnprocessableEntity, "unknown_instrument")
	case req.Side != api.Buy && req.Side != api.Sell:
		httpx.WriteReason(w, http.StatusUnprocessableEntity, "bad_side")
	case req.Qty <= 0:
		httpx.WriteReason(w, http.StatusUnprocessableEntity, "bad_qty")
	case req.Type == api.PlaceOrderRequestTypeMarket:
		// Mirrors the real backend today: market orders reject (Phase 7 gate).
		httpx.WriteReason(w, http.StatusUnprocessableEntity, "no_market_price")
	case req.Type != api.PlaceOrderRequestTypeLimit:
		httpx.WriteReason(w, http.StatusUnprocessableEntity, "bad_type")
	case req.LimitPrice == nil || *req.LimitPrice <= 0:
		httpx.WriteReason(w, http.StatusUnprocessableEntity, "bad_price")
	case req.Side == api.Buy && req.Qty*(*req.LimitPrice) > sampleBalance().Available:
		httpx.WriteReason(w, http.StatusUnprocessableEntity, "insufficient_funds")
	default:
		// 202 = accepted, NOT executed. The outcome is seen by polling observation/trades.
		httpx.WriteJSON(w, http.StatusAccepted, api.OrderIdResponse{OrderId: h.nextOrderID(req.AccountId)})
	}
}

func (h *handler) cancel(w http.ResponseWriter, r *http.Request) {
	var req api.CancelOrderRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	if req.AccountId == "" || req.OrderId == "" {
		httpx.WriteError(w, http.StatusBadRequest, "account_id and order_id are required")
		return
	}
	if !h.sessions.Active(req.AccountId) {
		httpx.WriteReason(w, http.StatusConflict, "no_session")
		return
	}
	// unknown_order deliberately merges "not found" and "belongs to another account".
	if !strings.HasPrefix(req.OrderId, req.AccountId+":") {
		httpx.WriteReason(w, http.StatusConflict, "unknown_order")
		return
	}
	// 202 = cancel accepted locally, NOT "cancelled".
	httpx.WriteJSON(w, http.StatusAccepted, api.OrderIdResponse{OrderId: req.OrderId})
}

func (h *handler) modify(w http.ResponseWriter, r *http.Request) {
	var req api.ModifyOrderRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	if req.AccountId == "" || req.OrderId == "" || req.Instrument == "" {
		httpx.WriteError(w, http.StatusBadRequest, "account_id, order_id and instrument are required")
		return
	}
	if req.NewQty <= 0 || (!req.IsMarket && (req.NewPrice == nil || *req.NewPrice <= 0)) {
		httpx.WriteError(w, http.StatusBadRequest, "new_qty must be > 0, and new_price > 0 for a limit replacement")
		return
	}
	// 409 = cancel leg failed, no place attempted (modify_status "rejected").
	reject := func(reason string) {
		httpx.WriteJSON(w, http.StatusConflict, api.ModifyResponse{
			ModifyStatus: api.Rejected,
			Cancel:       api.ModifyLeg{Status: ptr("rejected"), OrderId: &req.OrderId, Reason: &reason},
		})
	}
	if !h.sessions.Active(req.AccountId) {
		reject("no_session")
		return
	}
	if !strings.HasPrefix(req.OrderId, req.AccountId+":") {
		reject("unknown_order")
		return
	}
	newID := h.nextOrderID(req.AccountId)
	httpx.WriteJSON(w, http.StatusOK, api.ModifyResponse{
		ModifyStatus: api.Ok,
		Cancel:       api.ModifyLeg{Status: ptr("accepted"), OrderId: &req.OrderId},
		Replace:      &api.ModifyLeg{Status: ptr("accepted"), OrderId: &newID},
	})
}

// ---------------------------------------------------------------- money

// transfer never emits 409. Balances are computed from the placeholder balance but not persisted.
func (h *handler) transfer(w http.ResponseWriter, r *http.Request) {
	var req api.TransferRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	if req.AccountId == "" {
		httpx.WriteError(w, http.StatusBadRequest, "account_id is required")
		return
	}
	if req.Amount <= 0 {
		httpx.WriteError(w, http.StatusBadRequest, "amount must be > 0")
		return
	}
	b := sampleBalance()
	switch req.Direction {
	case api.ToBank:
		if req.Amount > b.Available {
			httpx.WriteError(w, http.StatusUnprocessableEntity, "insufficient trading balance")
			return
		}
		b.Available -= req.Amount
		b.Bank += req.Amount
	case api.ToTrading:
		if req.Amount > b.Bank {
			httpx.WriteError(w, http.StatusUnprocessableEntity, "insufficient bank balance")
			return
		}
		b.Available += req.Amount
		b.Bank -= req.Amount
	default:
		httpx.WriteError(w, http.StatusBadRequest, "direction must be to_bank or to_trading")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, api.TransferResponse{Available: b.Available, Bank: b.Bank})
}

// ---------------------------------------------------------------- live reads (409 without a session)

func (h *handler) balance(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.liveAccount(w, r); !ok {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, sampleBalance())
}

func (h *handler) positions(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.liveAccount(w, r); !ok {
		return
	}
	positions := samplePositions()
	if inst := r.URL.Query().Get("instrument"); inst != "" {
		filtered := positions[:0:0]
		for _, p := range positions {
			if p.Instrument == inst {
				filtered = append(filtered, p)
			}
		}
		positions = filtered // flat on an instrument -> empty, not an error
	}
	httpx.WriteJSON(w, http.StatusOK, api.PositionsResponse{Positions: positions})
}

func (h *handler) orders(w http.ResponseWriter, r *http.Request) {
	acct, ok := h.liveAccount(w, r)
	if !ok {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, api.OrdersResponse{Orders: sampleOrders(acct)})
}

// observation is the atomic dashboard read: balance + positions + orders + recent trades.
func (h *handler) observation(w http.ResponseWriter, r *http.Request) {
	acct, ok := h.liveAccount(w, r)
	if !ok {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, api.Observation{
		Balance:        sampleBalance(),
		Positions:      samplePositions(),
		Orders:         sampleOrders(acct),
		RecentTrades:   recentTrades(),
		TradesDegraded: false,
	})
}

// ---------------------------------------------------------------- durable reads (200 incl. empty)

func (h *handler) trades(w http.ResponseWriter, r *http.Request) {
	if _, ok := httpx.RequireQuery(w, r, "account_id"); !ok {
		return
	}
	limit, ok := httpx.OptionalLimit(w, r, 50)
	if !ok {
		return
	}
	before, ok := httpx.OptionalRFC3339(w, r, "before")
	if !ok {
		return
	}
	items, next := page(history(time.Now()), before, limit)
	trades := make([]api.Trade, 0, len(items)) // empty is 200 with trades: [], never 404
	for _, it := range items {
		trades = append(trades, it.trade)
	}
	httpx.WriteJSON(w, http.StatusOK, api.TradesPage{Trades: trades, NextBefore: next})
}

func (h *handler) pnl(w http.ResponseWriter, r *http.Request) {
	if _, ok := httpx.RequireQuery(w, r, "account_id"); !ok {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, pnlSummary(history(time.Now())))
}

// costsCountry validates account_id + the case-sensitive country param. US -> 501 (tax/costs
// are IN-only); anything other than IN/US -> 400.
func costsCountry(w http.ResponseWriter, r *http.Request) bool {
	if _, ok := httpx.RequireQuery(w, r, "account_id"); !ok {
		return false
	}
	country, ok := httpx.RequireQuery(w, r, "country")
	if !ok {
		return false
	}
	switch country {
	case "IN":
		return true
	case "US":
		httpx.WriteError(w, http.StatusNotImplemented, "costs are not implemented for country US")
	default:
		httpx.WriteError(w, http.StatusBadRequest, "country must be IN or US (case-sensitive)")
	}
	return false
}

func (h *handler) costs(w http.ResponseWriter, r *http.Request) {
	if !costsCountry(w, r) {
		return
	}
	limit, ok := httpx.OptionalLimit(w, r, 50)
	if !ok {
		return
	}
	before, ok := httpx.OptionalRFC3339(w, r, "before")
	if !ok {
		return
	}
	items, next := page(history(time.Now()), before, limit)
	trades := make([]api.CostsTrade, 0, len(items))
	for _, it := range items {
		trades = append(trades, it.costs)
	}
	httpx.WriteJSON(w, http.StatusOK, api.CostsPage{Trades: trades, NextBefore: next})
}

func (h *handler) costsSummary(w http.ResponseWriter, r *http.Request) {
	if !costsCountry(w, r) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, costsSummary(history(time.Now())))
}

// ---------------------------------------------------------------- placeholder data

func ptr[T any](v T) *T { return &v }

func sampleBalance() api.Balance {
	return api.Balance{Available: 9_500_000, Reserved: 500_000, Settled: 9_000_000, Bank: 25_000_000}
}

// samplePositions: mark_available is always false today (Phase 7), so ltp and
// gross_unrealized are 0. qty and weighted_avg_entry are real.
func samplePositions() []api.Position {
	return []api.Position{{
		Instrument: "ACME", Qty: 10, ReservedQty: 0, WeightedAvgEntry: 10050,
		MarkAvailable: false, Ltp: 0, GrossUnrealized: 0,
	}}
}

func sampleOrders(accountID string) []api.OpenOrder {
	return []api.OpenOrder{{
		OrderId: accountID + ":0", Instrument: "BETA", Side: api.OpenOrderSideBuy, IsMarket: false,
		LimitPrice: 4995, OrigQty: 20, RemainingQty: 20, FilledQty: 0,
		ReservedCash: 99_900, ReservedUnits: 0, Status: api.Working, CancelInFlight: false,
	}}
}

// recentTrades is observation's strip: up to 20, newest first, from the same history.
func recentTrades() []api.Trade {
	items, _ := page(history(time.Now()), nil, 20)
	out := make([]api.Trade, 0, len(items))
	for _, it := range items {
		out = append(out, it.trade)
	}
	return out
}
