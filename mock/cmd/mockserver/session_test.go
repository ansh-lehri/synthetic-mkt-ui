package main

import (
	"testing"
	"time"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/catalog"
)

// A live session carries the market's current naive-local time (`now`) so the UI can show a
// clock without touching UTC; it follows the session clock and stays before closes_at.
func TestSessionCarriesMarketNow(t *testing.T) {
	e := newEnv(t) // simulated 10:00 on day 0
	var s api.ActiveSession
	decode(t, e.want("POST", "/v1/session/live/join", `{"account_id":"n1","market":"IN"}`, 200), &s)
	if s.Now == nil || s.ClosesAt == nil {
		t.Fatalf("live session needs now + closes_at: %+v", s)
	}
	if want := testDay0.Add(10 * time.Hour).Format(catalog.NaiveLayout); *s.Now != want {
		t.Fatalf("now = %s, want %s", *s.Now, want)
	}
	e.advanceSim(30 * time.Minute)
	var st api.SessionState
	decode(t, e.want("GET", "/v1/session?account_id=n1", "", 200), &st)
	if st.Active == nil || *st.Active.Now != testDay0.Add(10*time.Hour+30*time.Minute).Format(catalog.NaiveLayout) {
		t.Fatalf("now must follow the session clock: %+v", st.Active)
	}
	if *st.Active.Now >= *st.Active.ClosesAt {
		t.Fatalf("now %s should be before closes_at %s", *st.Active.Now, *st.Active.ClosesAt)
	}
	// practice carries one too
	e.want("POST", "/v1/session/exit", `{"account_id":"n1"}`, 200)
	var p api.ActiveSession
	decode(t, e.want("POST", "/v1/session/practice/start", `{"account_id":"n1","market":"IN","condition":"normal_day","length_minutes":90}`, 200), &p)
	if p.Now == nil || p.Type != api.Practice {
		t.Fatalf("practice session: %+v", p)
	}
}

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
