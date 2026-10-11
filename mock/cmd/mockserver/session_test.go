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
