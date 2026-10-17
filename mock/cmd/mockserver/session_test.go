package main

import (
	"testing"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
)

// Exit returns the account to "no session": reads 409 again, and a new session can start.
func TestExitThenRejoin(t *testing.T) {
	e := newEnv(t)
	sid := e.join("n2")
	e.want("GET", "/v1/account/observation?account_id=n2", "", 200)
	e.exit(sid)
	wantError(t, e.want("POST", "/session/current", `{"user":{"user_id":"n2"}}`, 404))
	wantError(t, e.want("GET", "/v1/account/observation?account_id=n2", "", 409))
	wantReason(t, e.want("POST", "/v1/orders", `{"account_id":"n2","instrument":"ACME","side":"buy","type":"limit","tif":"gtc","qty":1,"limit_price":10050}`, 409), "no_session")
	e.join("n2")
	e.want("GET", "/v1/account/observation?account_id=n2", "", 200)
}

// A transfer moves the account's ledger: the balances every other read shows follow it, it needs
// no session, and an overdraft is refused with 422.
func TestTransferMovesTheLedger(t *testing.T) {
	e := newEnv(t)
	var tr api.TransferResponse
	decode(t, e.want("POST", "/v1/account/transfer", `{"account_id":"m1","direction":"to_bank","amount":1000000}`, 200), &tr)
	if tr.Available != 8_500_000 || tr.Bank != 26_000_000 {
		t.Fatalf("transfer response: %+v", tr)
	}
	e.join("m1")
	obs := e.obs("m1")
	if obs.Balance.Available != 8_500_000 || obs.Balance.Bank != 26_000_000 || obs.Balance.Settled != 8_500_000 {
		t.Fatalf("observation must follow the transfer: %+v", obs.Balance)
	}
	wantError(t, e.want("POST", "/v1/account/transfer", `{"account_id":"m1","direction":"to_bank","amount":8500001}`, 422))
	decode(t, e.want("POST", "/v1/account/transfer", `{"account_id":"m1","direction":"to_trading","amount":26000000}`, 200), &tr)
	if tr.Available != 34_500_000 || tr.Bank != 0 {
		t.Fatalf("round trip: %+v", tr)
	}
}

// ondemand starts an on-demand session and decodes the warming_up body (fails the test
// if the gate rejected it instead — see ondemandInsufficientFunds for that case).
func (e *env) ondemand(acct string) api.OnDemandWarmingUpBody {
	e.t.Helper()
	e.want("POST", "/v1/account/open", `{"user":{"user_id":"`+acct+`"}}`, 200)
	var od api.OnDemandWarmingUpBody
	decode(e.t, e.want("POST", "/session/ondemand?market=IN&duration=60", `{"user":{"user_id":"`+acct+`"}}`, 200), &od)
	if od.Status != api.WarmingUp {
		e.t.Fatalf("expected warming_up, got %+v", od)
	}
	return od
}

// Practice (on-demand) will not start below the minimum trading balance — the real
// contract's money-floor gate is a 200 insufficient_funds body, NEVER a 409.
func TestPracticeNeedsMinimumBalance(t *testing.T) {
	e := newEnv(t)
	e.want("POST", "/v1/account/open", `{"user":{"user_id":"p1"}}`, 200)
	e.want("POST", "/v1/account/transfer", `{"account_id":"p1","direction":"to_bank","amount":9450000}`, 200) // leaves 500.00 (below the 1,000.00 minimum)
	var insuff api.OnDemandInsufficientFundsBody
	decode(t, e.want("POST", "/session/ondemand?market=IN&duration=60", `{"user":{"user_id":"p1"}}`, 200), &insuff)
	if insuff.Status != api.InsufficientFunds || insuff.Message == "" {
		t.Fatalf("bad gate rejection: %+v", insuff)
	}
	e.want("POST", "/v1/account/transfer", `{"account_id":"p1","direction":"to_trading","amount":600000}`, 200)
	od := e.ondemand("p1")
	e.exit(od.SessionId)
	e.want("POST", "/v1/account/transfer", `{"account_id":"p1","direction":"to_bank","amount":650000}`, 200)
	e.want("POST", "/session/canonical", `{"user":{"user_id":"p1"},"market":"IN"}`, 200) // live/canonical has no minimum
}

// A practice (on-demand) session trades a COPY of the trading balance: orders and fills
// show up in the live reads while it lasts, but nothing flows back to the real account
// and nothing is recorded.
func TestPracticeIsIsolated(t *testing.T) {
	e := newEnv(t)
	live := e.obs2("q1") // joins live once to read the real starting state
	e.exit(e.currentSessionID("q1"))

	od := e.ondemand("q1")
	o := e.obs("q1")
	if o.Balance.Available != live.Balance.Available || len(o.Positions) != 0 || len(o.Orders) != 0 || len(o.RecentTrades) != 0 {
		t.Fatalf("practice starts from a copy of the trading balance with nothing else: %+v", o)
	}

	e.order("q1", "buy", 10, 10100)
	e.tick(tFill)
	e.order("q1", "sell", 10, 10200)
	e.tick(tFill)
	o = e.obs("q1")
	if len(o.RecentTrades) != 1 || o.RecentTrades[0].NetPnl <= 0 || len(o.Positions) != 0 {
		t.Fatalf("the round trip should show in practice: %+v", o)
	}
	if o.Balance.Available == live.Balance.Available {
		t.Fatal("practice balance should have moved")
	}

	// nothing is recorded, and the real account is untouched
	var pnl, pnl0 api.PnlSummary
	decode(t, e.want("GET", "/v1/account/pnl?account_id=q1", "", 200), &pnl)
	decode(t, e.want("GET", "/v1/account/pnl?account_id=other", "", 200), &pnl0)
	if pnl != pnl0 {
		t.Fatalf("practice trades must not be recorded: %+v vs %+v", pnl, pnl0)
	}
	var tr api.TransferResponse
	decode(t, e.want("POST", "/v1/account/transfer", `{"account_id":"q1","direction":"to_trading","amount":1}`, 200), &tr)
	if tr.Available != live.Balance.Available+1 {
		t.Fatalf("real trading balance must be unchanged by practice: %d", tr.Available)
	}

	// a new practice session starts fresh from the real balance
	e.exit(od.SessionId)
	od = e.ondemand("q1")
	o = e.obs("q1")
	if o.Balance.Available != live.Balance.Available+1 || len(o.RecentTrades) != 0 {
		t.Fatalf("a new practice session must start fresh: %+v", o)
	}
	// and the real account is back after leaving practice
	e.exit(od.SessionId)
	sid := e.join("q1")
	if got := e.obs("q1"); got.Balance.Available != live.Balance.Available+1 || len(got.Positions) != 1 {
		t.Fatalf("live account after practice: %+v", got)
	}
	e.exit(sid)
}

// obs2 joins live, returns the observation (the real starting state) and leaves the session open.
func (e *env) obs2(acct string) api.Observation {
	e.t.Helper()
	e.join(acct)
	return e.obs(acct)
}

// currentSessionID resolves an account's current session_id via /session/current.
func (e *env) currentSessionID(acct string) string {
	e.t.Helper()
	var cur api.SessionCurrentResponse
	decode(e.t, e.want("POST", "/session/current", `{"user":{"user_id":"`+acct+`"}}`, 200), &cur)
	return cur.SessionId
}
