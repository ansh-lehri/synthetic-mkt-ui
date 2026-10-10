package main

import (
	"fmt"
	"testing"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
)

func (e *env) obs(acct string) api.Observation {
	e.t.Helper()
	var o api.Observation
	decode(e.t, e.want("GET", "/v1/account/observation?account_id="+acct, "", 200), &o)
	return o
}

func (e *env) order(acct, side string, qty, price int64) string {
	e.t.Helper()
	var r api.OrderIdResponse
	body := fmt.Sprintf(`{"account_id":%q,"instrument":"ACME","side":%q,"type":"limit","tif":"gtc","qty":%d,"limit_price":%d}`, acct, side, qty, price)
	decode(e.t, e.want("POST", "/v1/orders", body, 202), &r)
	return r.OrderId
}

// A placed limit order is working, then partly filled, then filled: balance, position and the
// reserve follow it; selling the position down closes a round trip that shows up as a trade
// in observation, /trades and /pnl, which all agree.
func TestOrderLifecycle(t *testing.T) {
	e := newEnv(t)
	e.join("L1")
	start := e.obs("L1")
	if len(start.Orders) != 0 || len(start.Positions) != 1 || start.Positions[0].Qty != 10 {
		t.Fatalf("seed state: %+v", start)
	}

	id := e.order("L1", "buy", 10, 10100) // cost 101000
	o := e.obs("L1")
	if len(o.Orders) != 1 || o.Orders[0].OrderId != id || o.Orders[0].Status != api.Working || o.Orders[0].ReservedCash != 101000 {
		t.Fatalf("working order: %+v", o.Orders)
	}
	if o.Balance.Reserved != 101000 || o.Balance.Available != start.Balance.Available-101000 {
		t.Fatalf("reserve not held: %+v", o.Balance)
	}

	e.tick(tPartial)
	o = e.obs("L1")
	if len(o.Orders) != 1 || o.Orders[0].Status != api.PartiallyFilled || o.Orders[0].FilledQty != 5 || o.Orders[0].RemainingQty != 5 {
		t.Fatalf("partial fill: %+v", o.Orders)
	}
	if o.Positions[0].Qty != 15 {
		t.Fatalf("position after partial: %+v", o.Positions)
	}

	e.tick(tFill)
	o = e.obs("L1")
	if len(o.Orders) != 0 {
		t.Fatalf("filled order must leave the book: %+v", o.Orders)
	}
	p := o.Positions[0]
	// 10 @ 10050 + 10 @ 10100 -> 20 @ 10075 (weighted)
	if p.Qty != 20 || p.WeightedAvgEntry != 10075 || p.MarkAvailable || p.Ltp != 0 || p.GrossUnrealized != 0 {
		t.Fatalf("position after fill: %+v", p)
	}
	if o.Balance.Reserved != 0 || o.Balance.Available != start.Balance.Available-101000 {
		t.Fatalf("balance after fill: %+v", o.Balance)
	}
	if len(o.RecentTrades) == 0 || o.RecentTrades[0].TradeId[0] == 's' {
		t.Fatal("opening a position must not create a closed trade")
	}

	// Sell 5 @ 10175: closes 5 units of the round trip at entry 10075.
	e.order("L1", "sell", 5, 10175)
	e.tick(tFill)
	o = e.obs("L1")
	if len(o.Orders) != 0 || o.Positions[0].Qty != 15 || o.Positions[0].WeightedAvgEntry != 10075 {
		t.Fatalf("after sell: %+v / %+v", o.Orders, o.Positions)
	}
	tr := o.RecentTrades[0]
	if tr.TradeId != "s-0001" || tr.Instrument != "ACME" || tr.Quantity != 5 || tr.EntryPrice != 10075 || tr.ExitPrice != 10175 || tr.GrossPnl != 500 {
		t.Fatalf("closed trade: %+v", tr)
	}
	if tr.NetPnl != tr.GrossPnl-tr.TotalCosts {
		t.Fatalf("net != gross - costs: %+v", tr)
	}

	// The durable reads agree with observation.
	var page api.TradesPage
	decode(t, e.want("GET", "/v1/account/trades?account_id=L1&limit=1", "", 200), &page)
	if len(page.Trades) != 1 || page.Trades[0].TradeId != "s-0001" {
		t.Fatalf("/trades newest: %+v", page.Trades)
	}
	var base, mine api.PnlSummary
	decode(t, e.want("GET", "/v1/account/pnl?account_id=other", "", 200), &base)
	decode(t, e.want("GET", "/v1/account/pnl?account_id=L1", "", 200), &mine)
	if mine.TradeCount != base.TradeCount+1 || mine.NetPnl != base.NetPnl+tr.NetPnl {
		t.Fatalf("pnl: base %+v mine %+v", base, mine)
	}
}

func TestSellRulesAndCancel(t *testing.T) {
	e := newEnv(t)
	e.join("L2")
	// can't sell what isn't held (no shorting in the mock)
	wantReason(t, e.want("POST", "/v1/orders",
		`{"account_id":"L2","instrument":"ACME","side":"sell","type":"limit","tif":"gtc","qty":11,"limit_price":10100}`, 422), "insufficient_funds")
	// lot size and tick grid are enforced
	wantReason(t, e.want("POST", "/v1/orders",
		`{"account_id":"L2","instrument":"BETA","side":"buy","type":"limit","tif":"gtc","qty":5,"limit_price":4995}`, 422), "bad_qty")
	wantReason(t, e.want("POST", "/v1/orders",
		`{"account_id":"L2","instrument":"ACME","side":"buy","type":"limit","tif":"gtc","qty":1,"limit_price":10052}`, 422), "bad_price")

	before := e.obs("L2")
	sell := e.order("L2", "sell", 10, 10100) // reserves all 10 units
	o := e.obs("L2")
	if o.Orders[0].ReservedUnits != 10 || o.Positions[0].ReservedQty != 10 {
		t.Fatalf("units not reserved: %+v %+v", o.Orders, o.Positions)
	}
	wantReason(t, e.want("POST", "/v1/orders",
		`{"account_id":"L2","instrument":"ACME","side":"sell","type":"limit","tif":"gtc","qty":1,"limit_price":10100}`, 422), "insufficient_funds")

	e.want("POST", "/v1/orders/cancel", `{"account_id":"L2","order_id":"`+sell+`"}`, 202)
	o = e.obs("L2")
	if len(o.Orders) != 1 || !o.Orders[0].CancelInFlight {
		t.Fatalf("cancel must be in flight, not done: %+v", o.Orders)
	}
	e.tick(tCancel)
	o = e.obs("L2")
	if len(o.Orders) != 0 || o.Positions[0].ReservedQty != 0 || o.Balance != before.Balance {
		t.Fatalf("cancel must release the reserve: %+v %+v", o.Orders, o.Balance)
	}
}

// Modify cancels then re-places; when the replacement is refused the user is left with no
// order and the response says so (modify_status partial + a warning).
func TestModifyPartial(t *testing.T) {
	e := newEnv(t)
	e.join("L3")
	id := e.order("L3", "buy", 10, 10100)
	var mr api.ModifyResponse
	body := `{"account_id":"L3","order_id":"` + id + `","instrument":"ACME","side":"buy","is_market":false,"new_qty":99999999,"new_price":10100}`
	decode(t, e.want("POST", "/v1/orders/modify", body, 200), &mr)
	if mr.ModifyStatus != api.Partial || mr.Warning == nil || *mr.Warning == "" || mr.Replace == nil || *mr.Replace.Status != "rejected" {
		t.Fatalf("partial modify: %+v", mr)
	}
	o := e.obs("L3")
	if len(o.Orders) != 0 {
		t.Fatalf("no order should remain: %+v", o.Orders)
	}
	if o.Balance.Reserved != 0 {
		t.Fatalf("reserve must be released: %+v", o.Balance)
	}
	// a market replacement is refused the same way
	id = e.order("L3", "buy", 1, 10100)
	body = `{"account_id":"L3","order_id":"` + id + `","instrument":"ACME","side":"buy","is_market":true,"new_qty":1}`
	decode(t, e.want("POST", "/v1/orders/modify", body, 200), &mr)
	if mr.ModifyStatus != api.Partial || *mr.Replace.Reason != "no_market_price" {
		t.Fatalf("market modify: %+v", mr)
	}
}
