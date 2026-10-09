// Package broker serves the account/order axis: the 12 broker endpoints (orders, money,
// live account reads, durable account reads).
//
// Phase 0: valid, correctly-shaped placeholder responses with the right status codes and
// the two error envelopes. No account state is kept and nothing is simulated — a placed
// order does not appear in /v1/account/orders. Behaviour comes in later phases.
package broker

import (
	"fmt"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/httpx"
)

var orderSeq atomic.Int64

func nextOrderID(accountID string) string {
	return fmt.Sprintf("%s:%d", accountID, orderSeq.Add(1))
}

// Register mounts the broker routes on mux.
func Register(mux *http.ServeMux) {
	// orders
	mux.HandleFunc("/v1/orders", httpx.Method(http.MethodPost, handlePlace))
	mux.HandleFunc("/v1/orders/cancel", httpx.Method(http.MethodPost, handleCancel))
	mux.HandleFunc("/v1/orders/modify", httpx.Method(http.MethodPost, handleModify))
	// money
	mux.HandleFunc("/v1/account/transfer", httpx.Method(http.MethodPost, handleTransfer))
	// live account reads
	mux.HandleFunc("/v1/account/balance", httpx.Method(http.MethodGet, handleBalance))
	mux.HandleFunc("/v1/account/positions", httpx.Method(http.MethodGet, handlePositions))
	mux.HandleFunc("/v1/account/orders", httpx.Method(http.MethodGet, handleOrders))
	mux.HandleFunc("/v1/account/observation", httpx.Method(http.MethodGet, handleObservation))
	// durable account reads
	mux.HandleFunc("/v1/account/trades", httpx.Method(http.MethodGet, handleTrades))
	mux.HandleFunc("/v1/account/pnl", httpx.Method(http.MethodGet, handlePnl))
	mux.HandleFunc("/v1/account/costs", httpx.Method(http.MethodGet, handleCosts))
	mux.HandleFunc("/v1/account/costs/summary", httpx.Method(http.MethodGet, handleCostsSummary))
}

// ---------------------------------------------------------------- orders

func handlePlace(w http.ResponseWriter, r *http.Request) {
	var req api.PlaceOrderRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	if req.AccountId == "" || req.Instrument == "" {
		httpx.WriteError(w, http.StatusBadRequest, "account_id and instrument are required")
		return
	}
	switch {
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
	default:
		// 202 = accepted, NOT executed. The outcome is seen by polling observation/trades.
		httpx.WriteJSON(w, http.StatusAccepted, api.OrderIdResponse{OrderId: nextOrderID(req.AccountId)})
	}
}

func handleCancel(w http.ResponseWriter, r *http.Request) {
	var req api.CancelOrderRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	if req.AccountId == "" || req.OrderId == "" {
		httpx.WriteError(w, http.StatusBadRequest, "account_id and order_id are required")
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

func handleModify(w http.ResponseWriter, r *http.Request) {
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
	if !strings.HasPrefix(req.OrderId, req.AccountId+":") {
		// Cancel leg failed; no place attempted.
		httpx.WriteJSON(w, http.StatusConflict, api.ModifyResponse{
			ModifyStatus: api.Rejected,
			Cancel:       api.ModifyLeg{Status: ptr("rejected"), OrderId: &req.OrderId, Reason: ptr("unknown_order")},
		})
		return
	}
	newID := nextOrderID(req.AccountId)
	httpx.WriteJSON(w, http.StatusOK, api.ModifyResponse{
		ModifyStatus: api.Ok,
		Cancel:       api.ModifyLeg{Status: ptr("accepted"), OrderId: &req.OrderId},
		Replace:      &api.ModifyLeg{Status: ptr("accepted"), OrderId: &newID},
	})
}

// ---------------------------------------------------------------- money

func handleTransfer(w http.ResponseWriter, r *http.Request) {
	var req api.TransferRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	if req.AccountId == "" {
		httpx.WriteError(w, http.StatusBadRequest, "account_id is required")
		return
	}
	if req.Direction != api.ToBank && req.Direction != api.ToTrading {
		httpx.WriteError(w, http.StatusBadRequest, "direction must be to_bank or to_trading")
		return
	}
	if req.Amount <= 0 {
		httpx.WriteError(w, http.StatusBadRequest, "amount must be > 0")
		return
	}
	// Placeholder balances; the transfer is not applied. Transfer never emits 409.
	httpx.WriteJSON(w, http.StatusOK, api.TransferResponse{Available: sampleBalance().Available, Bank: sampleBalance().Bank})
}

// ---------------------------------------------------------------- live reads

func handleBalance(w http.ResponseWriter, r *http.Request) {
	if _, ok := httpx.RequireQuery(w, r, "account_id"); !ok {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, sampleBalance())
}

func handlePositions(w http.ResponseWriter, r *http.Request) {
	if _, ok := httpx.RequireQuery(w, r, "account_id"); !ok {
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

func handleOrders(w http.ResponseWriter, r *http.Request) {
	acct, ok := httpx.RequireQuery(w, r, "account_id")
	if !ok {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, api.OrdersResponse{Orders: sampleOrders(acct)})
}

func handleObservation(w http.ResponseWriter, r *http.Request) {
	acct, ok := httpx.RequireQuery(w, r, "account_id")
	if !ok {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, api.Observation{
		Balance:        sampleBalance(),
		Positions:      samplePositions(),
		Orders:         sampleOrders(acct),
		RecentTrades:   sampleTrades(),
		TradesDegraded: false,
	})
}

// ---------------------------------------------------------------- durable reads

func handleTrades(w http.ResponseWriter, r *http.Request) {
	if _, ok := httpx.RequireQuery(w, r, "account_id"); !ok {
		return
	}
	// One page, last page (next_before = null).
	httpx.WriteJSON(w, http.StatusOK, api.TradesPage{Trades: sampleTrades(), NextBefore: nil})
}

func handlePnl(w http.ResponseWriter, r *http.Request) {
	if _, ok := httpx.RequireQuery(w, r, "account_id"); !ok {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, api.PnlSummary{
		TradeCount: 1, GrossPnl: 4500, TotalCosts: 312, NetPnl: 4188, WinCount: 1, LossCount: 0,
	})
}

// requireCostsCountry validates the case-sensitive country param. US -> 501 (tax/costs are
// IN-only); anything other than IN/US -> 400.
func requireCostsCountry(w http.ResponseWriter, r *http.Request) bool {
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

func handleCosts(w http.ResponseWriter, r *http.Request) {
	if !requireCostsCountry(w, r) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, api.CostsPage{
		Trades: []api.CostsTrade{{
			TradeId: sampleTradeID,
			Lines:   sampleCostLines(),
			Total:   312,
		}},
		NextBefore: nil,
	})
}

func handleCostsSummary(w http.ResponseWriter, r *http.Request) {
	if !requireCostsCountry(w, r) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, api.CostsSummary{TradeCount: 1, Lines: sampleCostLines(), Total: 312})
}

// ---------------------------------------------------------------- placeholder data

const sampleTradeID = "t-0001"

func ptr[T any](v T) *T { return &v }

func sampleBalance() api.Balance {
	return api.Balance{Available: 9_500_000, Reserved: 500_000, Settled: 9_000_000, Bank: 25_000_000}
}

func samplePositions() []api.Position {
	// mark_available is always false today (Phase 7), so ltp and gross_unrealized are 0.
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

func sampleTrades() []api.Trade {
	exit := time.Now().UTC().Truncate(time.Second).Add(-10 * time.Minute)
	return []api.Trade{{
		TradeId: sampleTradeID, Instrument: "ACME", Direction: api.Long, Quantity: 10,
		EntryPrice: 10050, ExitPrice: 10500,
		EntryAt: exit.Add(-25 * time.Minute), ExitAt: exit,
		GrossPnl: 4500, TotalCosts: 312, NetPnl: 4188, PnlPct: 4.48, ExitReason: "manual",
	}}
}

func sampleCostLines() []api.CostLine {
	return []api.CostLine{{Name: "stt", Amount: 112}, {Name: "exchange", Amount: 200}}
}
