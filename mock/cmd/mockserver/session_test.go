package main

import (
	"testing"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
)

// Exit returns the account to "no session": reads 409 again, and a new session can start.
func TestExitThenRejoin(t *testing.T) {
	e := newEnv(t)
	e.join("n2")
	e.want("GET", "/v1/account/observation?account_id=n2", "", 200)
	e.want("POST", "/v1/session/exit", `{"account_id":"n2"}`, 200)
	var st api.SessionState
	decode(t, e.want("GET", "/v1/session?account_id=n2", "", 200), &st)
	if st.Active != nil {
		t.Fatalf("active must be null after exit: %+v", st.Active)
	}
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

// Practice will not start below the minimum trading balance (409; live is unaffected).
func TestPracticeNeedsMinimumBalance(t *testing.T) {
	e := newEnv(t)
	e.want("POST", "/v1/account/transfer", `{"account_id":"p1","direction":"to_bank","amount":9450000}`, 200) // leaves 500.00 (below the 1,000.00 minimum)
	body := `{"account_id":"p1","market":"IN","condition":"normal_day","length_minutes":90}`
	wantReason(t, e.want("POST", "/v1/session/practice/start", body, 409), "below_minimum_balance")
	e.want("POST", "/v1/account/transfer", `{"account_id":"p1","direction":"to_trading","amount":600000}`, 200)
	e.want("POST", "/v1/session/practice/start", body, 200)
	e.want("POST", "/v1/session/exit", `{"account_id":"p1"}`, 200)
	e.want("POST", "/v1/account/transfer", `{"account_id":"p1","direction":"to_bank","amount":650000}`, 200)
	e.want("POST", "/v1/session/live/join", `{"account_id":"p1","market":"IN"}`, 200) // live has no minimum
}
