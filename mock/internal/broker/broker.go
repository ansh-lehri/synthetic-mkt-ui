// Package broker serves the account/order axis: the 12 broker endpoints (orders, money,
// live account reads, durable account reads).
//
// Behaviour: responses are valid, correctly-shaped data. Rules from the contract that ARE
// enforced:
//   - live reads (/balance, /positions, /orders, /observation) and orders need an active
//     session: 409 otherwise (live reads use the {"error"} envelope, orders the {"reason"} one);
//   - durable reads (/trades, /pnl, /costs*) are 200 incl. empty — never 404/409/504.
//
// Orders are simulated by a small in-memory per-account ledger (ledger.go): a placed limit
// order rests, partly fills, fills, and moves balance/positions/trades; cancel lands after a
// short delay. There is no market model beyond that.
package broker

import (
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/catalog"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/httpx"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/store"
)

type handler struct {
	sessions *store.Sessions
	cfg      Config
	orderSeq atomic.Int64

	mu       sync.Mutex
	ledgers  map[string]*ledger         // the real (live) account
	practice map[string]*practiceLedger // the account's CURRENT practice session, if any
}

// practiceLedger is a practice session's own book: a copy of the trading balance taken when the
// session first needs it, no positions, no history. Nothing in it ever reaches the live ledger,
// /trades, /pnl or /costs ("not recorded"). `seq` ties it to one session.
type practiceLedger struct {
	seq int64
	l   *ledger
}

// liveLedger is the account's real ledger advanced to now (created on first use). It backs the
// durable reads, transfers and the practice stake copy. Callers hold h.mu.
func (h *handler) liveLedger(acct string) *ledger {
	now := h.cfg.Now()
	l := h.ledgers[acct]
	if l == nil {
		l = newLedger(h.cfg, now)
		h.ledgers[acct] = l
	}
	l.advance(now)
	return l
}

// ledgerNow is the ledger of the session the account is IN: the live one, or — in a practice
// session — that session's own copy (created from the live trading balance the first time it is
// needed, fresh for every new practice session). Orders and the live reads use this one.
func (h *handler) ledgerNow(acct string) *ledger {
	if s, in := h.sessions.Get(acct); in && s.Type == api.Practice {
		seq, _ := h.sessions.Seq(acct)
		p := h.practice[acct]
		if p == nil || p.seq != seq {
			live := h.liveLedger(acct)
			l := newLedger(h.cfg, h.cfg.Now())
			l.practice = true
			l.available, l.reserved, l.settled, l.bank = live.available, 0, live.available, live.bank
			l.pos = map[string]*position{}
			p = &practiceLedger{seq: seq, l: l}
			h.practice[acct] = p
		}
		p.l.advance(h.cfg.Now())
		return p.l
	}
	return h.liveLedger(acct)
}

// items is the account's trade history: this session's closed trades, then the seeded history.
func (h *handler) items(acct string) []historyItem {
	h.mu.Lock()
	defer h.mu.Unlock()
	now := h.cfg.Now()
	base := history(now)
	if l := h.ledgers[acct]; l != nil {
		l.advance(now)
		return append(append([]historyItem{}, l.trades...), base...)
	}
	return base
}

func (h *handler) nextOrderID(accountID string) string {
	return fmt.Sprintf("%s:%d", accountID, h.orderSeq.Add(1))
}

// Register mounts the broker routes on mux.
func Register(mux *http.ServeMux, sessions *store.Sessions, cfg Config) *Accounts {
	h := &handler{sessions: sessions, cfg: cfg, ledgers: map[string]*ledger{}, practice: map[string]*practiceLedger{}}
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
	return &Accounts{h: h}
}

// Accounts lets other route packages read account state (e.g. practice's minimum-balance check).
type Accounts struct{ h *handler }

// Available is the account's trading balance (raw units).
func (a *Accounts) Available(accountID string) int64 {
	a.h.mu.Lock()
	defer a.h.mu.Unlock()
	return a.h.liveLedger(accountID).available
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
	// 422: business rejects, reason envelope. Argument errors win, in the contract's order.
	if reason := argReason(req.Instrument, string(req.Side), req.Qty); reason != "" {
		httpx.WriteReason(w, http.StatusUnprocessableEntity, reason)
		return
	}
	switch req.Type {
	case api.PlaceOrderRequestTypeMarket:
		// Mirrors the real backend today: market orders reject (Phase 7 gate).
		httpx.WriteReason(w, http.StatusUnprocessableEntity, "no_market_price")
		return
	case api.PlaceOrderRequestTypeLimit:
	default:
		httpx.WriteReason(w, http.StatusUnprocessableEntity, "bad_type")
		return
	}
	var limit int64
	if req.LimitPrice != nil {
		limit = *req.LimitPrice
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	l := h.ledgerNow(req.AccountId)
	id := h.nextOrderID(req.AccountId)
	if reason := l.rest(id, req.Instrument, string(req.Side), req.Qty, limit, h.cfg.Now()); reason != "" {
		httpx.WriteReason(w, http.StatusUnprocessableEntity, reason)
		return
	}
	// 202 = accepted, NOT executed. The outcome is seen by polling observation/trades.
	httpx.WriteJSON(w, http.StatusAccepted, api.OrderIdResponse{OrderId: id})
}

// argReason runs the order-argument checks that precede the type checks.
func argReason(instrument, side string, qty int64) string {
	switch _, known := catalog.Lookup(instrument); {
	case !known:
		return "unknown_instrument"
	case side != "buy" && side != "sell":
		return "bad_side"
	case qty <= 0:
		return "bad_qty"
	}
	return ""
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
	h.mu.Lock()
	defer h.mu.Unlock()
	l := h.ledgerNow(req.AccountId)
	// unknown_order deliberately merges "not found" and "belongs to another account".
	if reason := l.cancel(req.OrderId, h.cfg.Now()); reason != "" {
		httpx.WriteReason(w, http.StatusConflict, reason)
		return
	}
	// 202 = cancel accepted locally, NOT "cancelled" (cancel_in_flight until it lands).
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
	h.mu.Lock()
	defer h.mu.Unlock()
	l := h.ledgerNow(req.AccountId)
	if reason := l.cancelNow(req.OrderId); reason != "" {
		reject(reason)
		return
	}
	// The cancel leg landed. Now place the replacement; if THAT is refused the user is left
	// with no order: modify_status "partial" plus a warning to surface verbatim.
	newID := h.nextOrderID(req.AccountId)
	var reason string
	if req.IsMarket {
		reason = "no_market_price"
	} else {
		reason = l.rest(newID, req.Instrument, string(req.Side), req.NewQty, *req.NewPrice, h.cfg.Now())
	}
	if reason != "" {
		httpx.WriteJSON(w, http.StatusOK, api.ModifyResponse{
			ModifyStatus: api.Partial,
			Cancel:       api.ModifyLeg{Status: ptr("accepted"), OrderId: &req.OrderId},
			Replace:      &api.ModifyLeg{Status: ptr("rejected"), Reason: &reason},
			Warning:      ptr("The original order was cancelled but the replacement was rejected (" + reason + "). You no longer have a working order."),
		})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, api.ModifyResponse{
		ModifyStatus: api.Ok,
		Cancel:       api.ModifyLeg{Status: ptr("accepted"), OrderId: &req.OrderId},
		Replace:      &api.ModifyLeg{Status: ptr("accepted"), OrderId: &newID},
	})
}

// ---------------------------------------------------------------- money

// transfer never emits 409 and needs no session. It moves money on the account's ledger, so the
// balances every other read shows follow it.
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
	if req.Direction != api.ToBank && req.Direction != api.ToTrading {
		httpx.WriteError(w, http.StatusBadRequest, "direction must be to_bank or to_trading")
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	l := h.liveLedger(req.AccountId) // money movement is always on the real account
	if reason := l.transfer(req.Direction == api.ToBank, req.Amount); reason != "" {
		httpx.WriteError(w, http.StatusUnprocessableEntity, reason)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, api.TransferResponse{Available: l.available, Bank: l.bank})
}

// ---------------------------------------------------------------- live reads (409 without a session)

func (h *handler) balance(w http.ResponseWriter, r *http.Request) {
	acct, ok := h.liveAccount(w, r)
	if !ok {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	httpx.WriteJSON(w, http.StatusOK, h.ledgerNow(acct).balance())
}

func (h *handler) positions(w http.ResponseWriter, r *http.Request) {
	acct, ok := h.liveAccount(w, r)
	if !ok {
		return
	}
	h.mu.Lock()
	positions := h.ledgerNow(acct).positions()
	h.mu.Unlock()
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
	h.mu.Lock()
	defer h.mu.Unlock()
	httpx.WriteJSON(w, http.StatusOK, api.OrdersResponse{Orders: h.ledgerNow(acct).openOrders()})
}

// observation is the atomic dashboard read: balance + positions + orders + recent trades.
func (h *handler) observation(w http.ResponseWriter, r *http.Request) {
	acct, ok := h.liveAccount(w, r)
	if !ok {
		return
	}
	h.mu.Lock()
	l := h.ledgerNow(acct)
	obs := api.Observation{
		Balance:        l.balance(),
		Positions:      l.positions(),
		Orders:         l.openOrders(),
		RecentTrades:   recentTrades(observationTrades(l, h.cfg.Now())),
		TradesDegraded: false,
	}
	h.mu.Unlock()
	httpx.WriteJSON(w, http.StatusOK, obs)
}

// ---------------------------------------------------------------- durable reads (200 incl. empty)

func (h *handler) trades(w http.ResponseWriter, r *http.Request) {
	acct, ok := httpx.RequireQuery(w, r, "account_id")
	if !ok {
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
	items, next := page(h.items(acct), before, limit)
	trades := make([]api.Trade, 0, len(items)) // empty is 200 with trades: [], never 404
	for _, it := range items {
		trades = append(trades, it.trade)
	}
	httpx.WriteJSON(w, http.StatusOK, api.TradesPage{Trades: trades, NextBefore: next})
}

func (h *handler) pnl(w http.ResponseWriter, r *http.Request) {
	acct, ok := httpx.RequireQuery(w, r, "account_id")
	if !ok {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, pnlSummary(h.items(acct)))
}

// costsCountry validates account_id + the case-sensitive country param. US -> 501 (tax/costs
// are IN-only); anything other than IN/US -> 400.
func costsCountry(w http.ResponseWriter, r *http.Request) (string, bool) {
	acct, ok := httpx.RequireQuery(w, r, "account_id")
	if !ok {
		return "", false
	}
	country, ok := httpx.RequireQuery(w, r, "country")
	if !ok {
		return "", false
	}
	switch country {
	case "IN":
		return acct, true
	case "US":
		httpx.WriteError(w, http.StatusNotImplemented, "costs are not implemented for country US")
	default:
		httpx.WriteError(w, http.StatusBadRequest, "country must be IN or US (case-sensitive)")
	}
	return "", false
}

func (h *handler) costs(w http.ResponseWriter, r *http.Request) {
	acct, ok := costsCountry(w, r)
	if !ok {
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
	items, next := page(h.items(acct), before, limit)
	trades := make([]api.CostsTrade, 0, len(items))
	for _, it := range items {
		trades = append(trades, it.costs)
	}
	httpx.WriteJSON(w, http.StatusOK, api.CostsPage{Trades: trades, NextBefore: next})
}

func (h *handler) costsSummary(w http.ResponseWriter, r *http.Request) {
	acct, ok := costsCountry(w, r)
	if !ok {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, costsSummary(h.items(acct)))
}

// ---------------------------------------------------------------- placeholder data

func ptr[T any](v T) *T { return &v }

func sampleBalance() api.Balance {
	return api.Balance{Available: 9_500_000, Reserved: 500_000, Settled: 9_000_000, Bank: 25_000_000}
}

// recentTrades is observation's strip: up to 20, newest first.
func recentTrades(all []historyItem) []api.Trade {
	items, _ := page(all, nil, 20)
	out := make([]api.Trade, 0, len(items))
	for _, it := range items {
		out = append(out, it.trade)
	}
	return out
}

// observationTrades is the strip's source: the live account's session trades then the seeded
// history; a practice session shows only its own trades (nothing from it is recorded).
func observationTrades(l *ledger, now time.Time) []historyItem {
	if l.practice {
		return append([]historyItem{}, l.trades...)
	}
	return append(append([]historyItem{}, l.trades...), history(now)...)
}
