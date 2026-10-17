package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/broker"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/market"
	"github.com/gorilla/websocket"
)

// fakeNow is a hand-driven wall clock so session phases and bar closes are deterministic.
type fakeNow struct {
	mu sync.Mutex
	t  time.Time
}

func (f *fakeNow) now() time.Time {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.t
}

func (f *fakeNow) advance(d time.Duration) {
	f.mu.Lock()
	f.t = f.t.Add(d)
	f.mu.Unlock()
}

const testSpeed = 60 // simulated seconds per real second

var testDay0 = time.Date(2026, 10, 12, 0, 0, 0, 0, time.UTC) // first simulated day (naive-local)

type env struct {
	t     *testing.T
	srv   *httptest.Server
	wall  *fakeNow
	clock *market.Clock
	bwall *fakeNow // the broker's own clock (order fills / cancels), advanced by e.tick
}

// Fill timing under the test broker clock.
const (
	tPartial = time.Second
	tFill    = 2500 * time.Millisecond
	tCancel  = 800 * time.Millisecond
)

// newEnv starts the mock at simulated 10:00 on day 0 (market open).
func newEnv(t *testing.T) *env {
	t.Helper()
	wall := &fakeNow{t: time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)}
	clock := market.NewClock(testSpeed, 30*time.Second, testDay0, wall.now)
	bwall := &fakeNow{t: time.Date(2030, 1, 1, 12, 0, 0, 0, time.UTC)}
	srv := httptest.NewServer(newHandlerWith(clock, broker.Config{Now: bwall.now, PartialAfter: tPartial, FillAfter: tFill, CancelAfter: tCancel}))
	t.Cleanup(srv.Close)
	e := &env{t: t, srv: srv, wall: wall, clock: clock, bwall: bwall}
	e.advanceSim(time.Hour) // 09:00 -> 10:00
	return e
}

// tick moves the broker's clock (order fills and cancels) forward.
func (e *env) tick(d time.Duration) { e.bwall.advance(d) }

// advanceSim moves the simulated clock forward by d of SIMULATED time.
func (e *env) advanceSim(d time.Duration) { e.wall.advance(time.Duration(float64(d) / testSpeed)) }

// call performs a request and returns status + raw body. It also checks the headers every
// response must carry (JSON + open CORS).
func (e *env) call(method, path, body string) (int, []byte) {
	e.t.Helper()
	req, err := http.NewRequest(method, e.srv.URL+path, strings.NewReader(body))
	if err != nil {
		e.t.Fatal(err)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		e.t.Fatalf("%s %s: Content-Type = %q", method, path, ct)
	}
	if resp.Header.Get("Access-Control-Allow-Origin") != "*" {
		e.t.Fatalf("%s %s: missing CORS header", method, path)
	}
	return resp.StatusCode, raw
}

// decode parses raw into v and FAILS on unknown fields, so a response can't carry a field
// the contract doesn't define.
func decode(t *testing.T, raw []byte, v any) {
	t.Helper()
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		t.Fatalf("response does not match contract type %T: %v\nbody: %s", v, err, raw)
	}
}

func (e *env) want(method, path, body string, status int) []byte {
	e.t.Helper()
	got, raw := e.call(method, path, body)
	if got != status {
		e.t.Fatalf("%s %s: status %d, want %d\nbody: %s", method, path, got, status, raw)
	}
	return raw
}

func wantReason(t *testing.T, raw []byte, reason string) {
	t.Helper()
	var r api.ReasonEnvelope
	decode(t, raw, &r)
	if r.Reason != reason {
		t.Fatalf("reason = %q, want %q", r.Reason, reason)
	}
}

func wantError(t *testing.T, raw []byte) {
	t.Helper()
	var r api.ErrorBody
	decode(t, raw, &r)
	if r.Error == "" {
		t.Fatal("empty error message")
	}
}

// join opens the account (idempotent) and joins the canonical IN session, returning
// the session_id (needed by callers that later call exit/status/dialWS by session id).
func (e *env) join(acct string) string {
	e.t.Helper()
	e.want("POST", "/v1/account/open", `{"user":{"user_id":"`+acct+`"}}`, 200)
	var resp api.JoinCanonicalResponse
	decode(e.t, e.want("POST", "/session/canonical", `{"user":{"user_id":"`+acct+`"},"market":"IN"}`, 200), &resp)
	return resp.SessionId
}

// exit leaves a session by its session_id (the real contract's carrier for /session/exit).
func (e *env) exit(sessionID string) {
	e.t.Helper()
	e.want("POST", "/session/exit?session="+sessionID, "", 200)
}

// ---------------------------------------------------------------- session / reference

func TestReference(t *testing.T) {
	e := newEnv(t)

	var ms api.MarketsResponse
	decode(t, e.want("GET", "/v1/markets", "", 200), &ms)
	if len(ms.Markets) != 1 || ms.Markets[0].Tag != "IN" || !ms.Markets[0].Active {
		t.Fatalf("want exactly one active IN market, got %+v", ms.Markets)
	}
	if !ms.Markets[0].Session.ClosesAt.After(ms.Markets[0].Session.OpensAt) {
		t.Fatalf("session window must open before it closes: %+v", ms.Markets[0].Session)
	}
	if ms.Markets[0].Session.WallClock == "" || ms.Markets[0].Session.Duration == "" {
		t.Fatalf("wall_clock/duration must be set: %+v", ms.Markets[0].Session)
	}

	var in api.InstrumentsResponse
	decode(t, e.want("GET", "/v1/instruments?market=IN", "", 200), &in)
	if in.Market != "IN" || len(in.Instruments) != 2 {
		t.Fatalf("want 2 IN instruments, got %+v", in)
	}
	for _, i := range in.Instruments {
		if i.TickSize <= 0 {
			t.Fatalf("bad formatting contract: %+v", i)
		}
		if i.Name != nil || i.LotSize != nil || i.PriceDecimals != nil {
			t.Fatalf("name/lot_size/price_decimals must be absent on the wire (confirmed real-backend gap): %+v", i)
		}
	}
	wantError(t, e.want("GET", "/v1/instruments", "", 400))
	wantError(t, e.want("GET", "/v1/instruments?market=ZZ", "", 400))
}

func TestSessionGate(t *testing.T) {
	e := newEnv(t)

	wantError(t, e.want("GET", "/session/status?session=nope", "", 404))
	wantError(t, e.want("GET", "/session/status", "", 400))
	wantError(t, e.want("POST", "/session/current", `{"user":{"user_id":"a1"}}`, 404))

	var live api.JoinCanonicalResponse
	decode(t, e.want("POST", "/session/canonical", `{"user":{"user_id":"a1"},"market":"IN"}`, 200), &live)
	if live.Status != api.JoinCanonicalResponseStatusActive || live.SessionId == "" {
		t.Fatalf("bad canonical join: %+v", live)
	}

	var cur api.SessionCurrentResponse
	decode(t, e.want("POST", "/session/current", `{"user":{"user_id":"a1"}}`, 200), &cur)
	if cur.Mode != api.Canonical || cur.Status != api.SessionCurrentResponseStatusActive || cur.SessionId != live.SessionId {
		t.Fatalf("session should now be current: %+v", cur)
	}
	var st api.SessionStatusBody
	decode(t, e.want("GET", "/session/status?session="+live.SessionId, "", 200), &st)
	if st.Status != api.SessionStatusBodyStatusReady {
		t.Fatalf("canonical status should be ready: %+v", st)
	}

	// reconnect: same account, same market, already active -> the SAME session back, 200
	var reconnect api.JoinCanonicalResponse
	decode(t, e.want("POST", "/session/canonical", `{"user":{"user_id":"a1"},"market":"IN"}`, 200), &reconnect)
	if reconnect.SessionId != live.SessionId {
		t.Fatalf("reconnect must return the SAME session: %+v vs %+v", reconnect, live)
	}

	// other accounts are independent
	e.want("POST", "/session/canonical", `{"user":{"user_id":"a2"},"market":"IN"}`, 200)

	e.exit(live.SessionId)
	wantError(t, e.want("POST", "/session/current", `{"user":{"user_id":"a1"}}`, 404))
	wantError(t, e.want("GET", "/session/status?session="+live.SessionId, "", 404))

	// on-demand: no condition field on the wire; 200 warming_up, never a 409 for the gate
	var od api.OnDemandWarmingUpBody
	decode(t, e.want("POST", "/session/ondemand?market=IN&duration=60", `{"user":{"user_id":"a1"}}`, 200), &od)
	if od.Status != api.WarmingUp || od.SessionId == "" || od.WarmupEndsAt == "" || od.SessionEndsAt == "" {
		t.Fatalf("bad on-demand warming_up: %+v", od)
	}
	// one-session gate: a second trigger for the same busy account is a 409 error envelope
	wantError(t, e.want("POST", "/session/ondemand?market=IN&duration=60", `{"user":{"user_id":"a1"}}`, 409))
	wantError(t, e.want("POST", "/session/canonical", `{"user":{"user_id":"a1"},"market":"IN"}`, 409))
	e.exit(od.SessionId)

	// validation -> 400 error envelope
	wantError(t, e.want("POST", "/session/ondemand?market=IN&duration=abc", `{"user":{"user_id":"a1"}}`, 400))
	wantError(t, e.want("POST", "/session/ondemand?market=IN&duration=200", `{"user":{"user_id":"a1"}}`, 400))
	wantError(t, e.want("POST", "/session/ondemand", `{"user":{"user_id":"a1"}}`, 400))
	wantError(t, e.want("POST", "/session/canonical", `{"user":{"user_id":"a1"},"market":"ZZ"}`, 400))
	wantError(t, e.want("POST", "/session/canonical", `{`, 400))
}

// ---------------------------------------------------------------- live reads: 409 without a session

func TestLiveReadsNeedASession(t *testing.T) {
	e := newEnv(t)
	for _, p := range []string{"balance", "positions", "orders", "observation"} {
		wantError(t, e.want("GET", "/v1/account/"+p+"?account_id=s1", "", 409)) // error envelope, not reason
		wantError(t, e.want("GET", "/v1/account/"+p, "", 400))
	}

	sid := e.join("s1")
	var bal api.Balance
	decode(t, e.want("GET", "/v1/account/balance?account_id=s1", "", 200), &bal)

	var pos api.PositionsResponse
	decode(t, e.want("GET", "/v1/account/positions?account_id=s1", "", 200), &pos)
	if len(pos.Positions) == 0 {
		t.Fatal("expected a placeholder position")
	}
	for _, p := range pos.Positions {
		if p.MarkAvailable || p.Ltp != 0 || p.GrossUnrealized != 0 {
			t.Fatalf("position must be ungated-mark: mark_available=false, ltp=0, gross_unrealized=0, got %+v", p)
		}
	}
	decode(t, e.want("GET", "/v1/account/positions?account_id=s1&instrument=BETA", "", 200), &pos)
	if len(pos.Positions) != 0 {
		t.Fatal("flat instrument must be an empty list, not an error")
	}

	var ords api.OrdersResponse
	decode(t, e.want("GET", "/v1/account/orders?account_id=s1", "", 200), &ords)

	// /observation: the full atomic shape
	raw := e.want("GET", "/v1/account/observation?account_id=s1", "", 200)
	var obs api.Observation
	decode(t, raw, &obs)
	var keys map[string]json.RawMessage
	_ = json.Unmarshal(raw, &keys)
	for _, k := range []string{"balance", "positions", "orders", "recent_trades", "trades_degraded"} {
		if _, ok := keys[k]; !ok {
			t.Fatalf("observation missing %q", k)
		}
	}
	if obs.TradesDegraded || len(obs.RecentTrades) > 20 {
		t.Fatalf("bad recent_trades/trades_degraded: %+v", obs)
	}

	e.exit(sid)
	wantError(t, e.want("GET", "/v1/account/observation?account_id=s1", "", 409))
}

// ---------------------------------------------------------------- durable reads: 200 incl. empty

func TestDurableReadsNeverNeedASession(t *testing.T) {
	e := newEnv(t) // note: no session was ever started

	var tp api.TradesPage
	decode(t, e.want("GET", "/v1/account/trades?account_id=nosess", "", 200), &tp)
	if tp.Trades == nil {
		t.Fatal("trades must be [] not null")
	}
	// paging params: an old `before` yields an empty page that is still 200
	raw := e.want("GET", "/v1/account/trades?account_id=nosess&before=2000-01-01T00:00:00Z", "", 200)
	decode(t, raw, &tp)
	if len(tp.Trades) != 0 || !bytes.Contains(raw, []byte(`"trades":[]`)) {
		t.Fatalf("expected empty page, got %s", raw)
	}
	if tp.NextBefore != nil {
		t.Fatal("next_before must be null on the last page")
	}
	wantError(t, e.want("GET", "/v1/account/trades?account_id=a&limit=0", "", 400))
	wantError(t, e.want("GET", "/v1/account/trades?account_id=a&before=yesterday", "", 400))
	wantError(t, e.want("GET", "/v1/account/trades", "", 400))

	var pnl api.PnlSummary
	decode(t, e.want("GET", "/v1/account/pnl?account_id=nosess", "", 200), &pnl)

	var cp api.CostsPage
	decode(t, e.want("GET", "/v1/account/costs?account_id=nosess&country=IN", "", 200), &cp)
	var cs api.CostsSummary
	decode(t, e.want("GET", "/v1/account/costs/summary?account_id=nosess&country=IN", "", 200), &cs)
	// country=US -> 501; the case-sensitive param -> 400
	wantError(t, e.want("GET", "/v1/account/costs?account_id=a&country=US", "", 501))
	wantError(t, e.want("GET", "/v1/account/costs/summary?account_id=a&country=US", "", 501))
	wantError(t, e.want("GET", "/v1/account/costs?account_id=a&country=in", "", 400))
	wantError(t, e.want("GET", "/v1/account/costs?account_id=a", "", 400))
}

func TestCandles(t *testing.T) {
	e := newEnv(t)
	base := "/v1/candles?market=IN&instrument=ACME&timeframe=5m&from=2026-10-09T09:15:00&to=2026-10-09T10:15:00"

	var cr api.CandleResponse
	decode(t, e.want("GET", base, "", 200), &cr)
	if cr.Timezone != "Asia/Kolkata" || len(cr.Candles) != 12 || cr.NextCursor != nil {
		t.Fatalf("want 12 bars, null cursor, IST; got %d bars cursor=%v tz=%s", len(cr.Candles), cr.NextCursor, cr.Timezone)
	}
	b := cr.Candles[0]
	if b.Start != "2026-10-09T09:15:00" || b.End != "2026-10-09T09:20:00" {
		t.Fatalf("bars must be naive-local ISO: %+v", b)
	}
	for _, c := range cr.Candles {
		if c.High < c.Open || c.High < c.Close || c.Low > c.Open || c.Low > c.Close {
			t.Fatalf("incoherent OHLC: %+v", c)
		}
		if c.Open%5 != 0 || c.Close%5 != 0 { // ACME tick_size 5
			t.Fatalf("prices must sit on the tick grid: %+v", c)
		}
	}

	// cursor paging walks the whole range with no gaps or overlap
	decode(t, e.want("GET", base+"&limit=5", "", 200), &cr)
	if len(cr.Candles) != 5 || cr.NextCursor == nil {
		t.Fatalf("expected a first page of 5 with a cursor, got %d / %v", len(cr.Candles), cr.NextCursor)
	}
	seen := len(cr.Candles)
	for cr.NextCursor != nil {
		cursor := *cr.NextCursor
		decode(t, e.want("GET", base+"&limit=5&cursor="+cursor, "", 200), &cr)
		seen += len(cr.Candles)
	}
	if seen != 12 {
		t.Fatalf("paging covered %d bars, want 12", seen)
	}

	// empty is a 200, never a 404
	decode(t, e.want("GET", "/v1/candles?market=IN&instrument=ACME&timeframe=5m&from=2026-10-09T09:15:00&to=2026-10-09T09:15:00", "", 200), &cr)
	if len(cr.Candles) != 0 {
		t.Fatal("expected empty candles")
	}

	// 400s
	wantError(t, e.want("GET", strings.Replace(base, "5m", "2m", 1), "", 400))
	wantError(t, e.want("GET", strings.Replace(base, "ACME", "ZZZZ", 1), "", 400))
	wantError(t, e.want("GET", strings.Replace(base, "market=IN", "market=ZZ", 1), "", 400))
	wantError(t, e.want("GET", strings.Replace(base, "from=2026-10-09T09:15:00", "from=nope", 1), "", 400))
	wantError(t, e.want("GET", base+"&cursor=-3", "", 400))
	wantError(t, e.want("GET", "/v1/candles?market=IN", "", 400))
}

// ---------------------------------------------------------------- orders

func TestOrders(t *testing.T) {
	e := newEnv(t)
	limit := `{"account_id":"o1","instrument":"ACME","side":"buy","type":"limit","tif":"gtc","qty":5,"limit_price":10050}`

	// no session -> 409 reason envelope (orders), unlike live reads' error envelope
	wantReason(t, e.want("POST", "/v1/orders", limit, 409), "no_session")
	wantReason(t, e.want("POST", "/v1/orders/cancel", `{"account_id":"o1","order_id":"o1:1"}`, 409), "no_session")

	e.join("o1")

	var oid api.OrderIdResponse
	decode(t, e.want("POST", "/v1/orders", limit, 202), &oid) // 202 Accepted with just {order_id}
	if !strings.HasPrefix(oid.OrderId, "o1:") {
		t.Fatalf("order_id shape: %q", oid.OrderId)
	}

	// business rejects -> 422 with the REASON envelope
	for body, reason := range map[string]string{
		`{"account_id":"o1","instrument":"ZZZZ","side":"buy","type":"limit","tif":"gtc","qty":5,"limit_price":10050}`:        "unknown_instrument",
		`{"account_id":"o1","instrument":"ACME","side":"hold","type":"limit","tif":"gtc","qty":5,"limit_price":10050}`:       "bad_side",
		`{"account_id":"o1","instrument":"ACME","side":"buy","type":"limit","tif":"gtc","qty":0,"limit_price":10050}`:        "bad_qty",
		`{"account_id":"o1","instrument":"ACME","side":"buy","type":"market","tif":"ioc","qty":5}`:                           "no_market_price",
		`{"account_id":"o1","instrument":"ACME","side":"buy","type":"stop","tif":"gtc","qty":5}`:                             "bad_type",
		`{"account_id":"o1","instrument":"ACME","side":"buy","type":"limit","tif":"gtc","qty":5}`:                            "bad_price",
		`{"account_id":"o1","instrument":"ACME","side":"buy","type":"limit","tif":"gtc","qty":99999999,"limit_price":10050}`: "insufficient_funds",
	} {
		wantReason(t, e.want("POST", "/v1/orders", body, 422), reason)
	}
	// malformed -> 400 with the ERROR envelope
	wantError(t, e.want("POST", "/v1/orders", `{`, 400))
	wantError(t, e.want("POST", "/v1/orders", `{"instrument":"ACME"}`, 400))
	wantError(t, e.want("POST", "/v1/orders", strings.Replace(limit, `"gtc"`, `"day"`, 1), 400))
	wantError(t, e.want("GET", "/v1/orders", "", 405))

	// cancel: 202 accepted (not "cancelled"); foreign/unknown -> 409 unknown_order
	var cid api.OrderIdResponse
	decode(t, e.want("POST", "/v1/orders/cancel", `{"account_id":"o1","order_id":"`+oid.OrderId+`"}`, 202), &cid)
	wantReason(t, e.want("POST", "/v1/orders/cancel", `{"account_id":"o1","order_id":"zz:3"}`, 409), "unknown_order")
	wantReason(t, e.want("POST", "/v1/orders/cancel", `{"account_id":"o1","order_id":"`+oid.OrderId+`"}`, 409), "not_cancellable") // already cancelling

	// modify: 200 ok; 409 carries a ModifyResponse (rejected), not an envelope
	decode(t, e.want("POST", "/v1/orders", limit, 202), &oid)
	var mr api.ModifyResponse
	mod := `{"account_id":"o1","order_id":"` + oid.OrderId + `","instrument":"ACME","side":"buy","is_market":false,"new_qty":5,"new_price":10055}`
	decode(t, e.want("POST", "/v1/orders/modify", mod, 200), &mr)
	if mr.ModifyStatus != api.ModifyResponseModifyStatusOk || mr.Replace == nil {
		t.Fatalf("bad modify ok: %+v", mr)
	}
	decode(t, e.want("POST", "/v1/orders/modify", strings.Replace(mod, oid.OrderId, "zz:3", 1), 409), &mr)
	if mr.ModifyStatus != api.ModifyResponseModifyStatusRejected || mr.Replace != nil {
		t.Fatalf("bad modify rejected: %+v", mr)
	}
}

func TestTransfer(t *testing.T) {
	e := newEnv(t) // transfer is not session-gated and never emits 409
	var tr api.TransferResponse
	decode(t, e.want("POST", "/v1/account/transfer", `{"account_id":"t1","direction":"to_bank","amount":100}`, 200), &tr)
	decode(t, e.want("POST", "/v1/account/transfer", `{"account_id":"t1","direction":"to_trading","amount":100}`, 200), &tr)
	wantError(t, e.want("POST", "/v1/account/transfer", `{"account_id":"t1","direction":"to_bank","amount":999999999999}`, 422))
	wantError(t, e.want("POST", "/v1/account/transfer", `{"account_id":"t1","direction":"sideways","amount":1}`, 400))
	wantError(t, e.want("POST", "/v1/account/transfer", `{"account_id":"t1","direction":"to_bank","amount":0}`, 400))
}

func TestPlumbing(t *testing.T) {
	e := newEnv(t)
	wantError(t, e.want("GET", "/v1/nope", "", 404))

	// CORS preflight
	req, _ := http.NewRequest(http.MethodOptions, e.srv.URL+"/v1/orders", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent || resp.Header.Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("preflight: %d %v", resp.StatusCode, resp.Header)
	}
}

// ---------------------------------------------------------------- /ws

// dialWS requires a session_id now (the socket is session-scoped, no longer anonymous).
func dialWS(t *testing.T, e *env, sessionID string) *websocket.Conn {
	t.Helper()
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(e.srv.URL, "http")+"/v1/ws?session="+sessionID, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	return conn
}

func TestWSRequiresASession(t *testing.T) {
	e := newEnv(t)
	if _, resp, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(e.srv.URL, "http")+"/v1/ws", nil); err == nil || resp.StatusCode != 401 {
		t.Fatalf("missing session: err=%v status=%v", err, resp)
	}
	if _, resp, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(e.srv.URL, "http")+"/v1/ws?session=bogus", nil); err == nil || resp.StatusCode != 404 {
		t.Fatalf("unknown session: err=%v status=%v", err, resp)
	}
}

func TestWS(t *testing.T) {
	e := newEnv(t)
	sid := e.join("ws1")
	conn := dialWS(t, e, sid)

	var connected api.WsConnected
	if err := conn.ReadJSON(&connected); err != nil {
		t.Fatal(err)
	}
	if connected.Type != "connected" || connected.Market != "IN" || connected.Timezone != "Asia/Kolkata" {
		t.Fatalf("connected frame: %+v", connected)
	}

	sub := `{"type":"subscribe","subs":[
		{"stream":"candle","instrument":"ACME","timeframe":"5m"},
		{"stream":"snapshot","instrument":"ACME"},
		{"stream":"snapshot","instrument":"ZZZZ"},
		{"stream":"candle","instrument":"ACME","timeframe":"2m"},
		{"stream":"depth","instrument":"ACME"}]}`
	if err := conn.WriteMessage(websocket.TextMessage, []byte(sub)); err != nil {
		t.Fatal(err)
	}

	var ack api.WsAck
	if err := conn.ReadJSON(&ack); err != nil {
		t.Fatal(err)
	}
	if ack.Type != "ack" || len(ack.Results) != 5 {
		t.Fatalf("ack: %+v", ack)
	}
	wantStatus := []struct{ status, errMsg string }{
		{"ok", ""},
		{"ok", ""},
		{"error", "unknown instrument"},
		{"error", "bad timeframe"},
		{"error", "bad stream"},
	}
	for i, w := range wantStatus {
		if ack.Results[i].Status != w.status || ack.Results[i].Error != w.errMsg {
			t.Fatalf("result %d = %+v, want %+v", i, ack.Results[i], w)
		}
	}

	// the accepted snapshot sub is immediately followed by its seed (only that one)
	var snap api.WsSnapshot
	if err := conn.ReadJSON(&snap); err != nil {
		t.Fatal(err)
	}
	d := snap.Data
	if snap.Type != "snapshot" || snap.Instrument != "ACME" || d.Phase != "open" || !d.HasLast || !d.Quote.HasBid || !d.Quote.HasAsk {
		t.Fatalf("snapshot: %+v", snap)
	}
	if len(d.Depth.Bids) == 0 || len(d.Depth.Asks) == 0 || d.Depth.Bids[0].Price != d.Quote.BestBid || d.Depth.Asks[0].Price != d.Quote.BestAsk {
		t.Fatalf("depth must be best-first and match the quote: %+v", d)
	}
	if d.Quote.BestBid >= d.Quote.BestAsk {
		t.Fatalf("crossed book: %+v", d.Quote)
	}

	// unsubscribe is acked per sub and seeds nothing
	if err := conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"unsubscribe","subs":[{"stream":"snapshot","instrument":"ACME"}]}`)); err != nil {
		t.Fatal(err)
	}
	if err := conn.ReadJSON(&ack); err != nil {
		t.Fatal(err)
	}
	if len(ack.Results) != 1 || ack.Results[0].Status != "ok" {
		t.Fatalf("unsubscribe ack: %+v", ack)
	}

	// junk frames are ignored; the socket stays usable
	conn.WriteMessage(websocket.TextMessage, []byte(`not json`))
	conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"hello"}`))
	conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"subscribe","subs":[{"stream":"snapshot","instrument":"BETA"}]}`))
	if err := conn.ReadJSON(&ack); err != nil {
		t.Fatalf("socket died after junk frames: %v", err)
	}
	if err := conn.ReadJSON(&snap); err != nil || snap.Instrument != "BETA" {
		t.Fatalf("BETA seed: %v %+v", err, snap)
	}
}

// ---------------------------------------------------------------- history consistency

// walkTrades follows next_before until null, returning every trade in order.
func walkTrades(t *testing.T, e *env, limit int) (all []api.Trade, pages int) {
	t.Helper()
	path := "/v1/account/trades?account_id=h1&limit=" + strconv.Itoa(limit)
	for {
		var p api.TradesPage
		decode(t, e.want("GET", path, "", 200), &p)
		pages++
		all = append(all, p.Trades...)
		if p.NextBefore == nil {
			return all, pages
		}
		if len(p.Trades) != limit {
			t.Fatalf("a page with a next_before must be full: got %d of %d", len(p.Trades), limit)
		}
		path = "/v1/account/trades?account_id=h1&limit=" + strconv.Itoa(limit) + "&before=" + url.QueryEscape(p.NextBefore.Format(time.RFC3339))
		if pages > 100 {
			t.Fatal("cursor never ended")
		}
	}
}

func TestTradesPagingWalksToNull(t *testing.T) {
	e := newEnv(t)
	all, pages := walkTrades(t, e, 10)
	if len(all) != 27 || pages != 3 {
		t.Fatalf("want 27 trades over 3 pages, got %d over %d", len(all), pages)
	}
	seen := map[string]bool{}
	for i, tr := range all {
		if seen[tr.TradeId] {
			t.Fatalf("duplicate trade %s across pages", tr.TradeId)
		}
		seen[tr.TradeId] = true
		if i > 0 && !tr.ExitAt.Before(all[i-1].ExitAt) {
			t.Fatalf("not strictly newest-first at %d", i)
		}
		if !tr.EntryAt.Before(tr.ExitAt) {
			t.Fatalf("entry must precede exit: %+v", tr)
		}
		if tr.NetPnl != tr.GrossPnl-tr.TotalCosts {
			t.Fatalf("net != gross - costs: %+v", tr)
		}
	}
	// one page when the limit covers everything: next_before is null straight away
	if one, pages := walkTrades(t, e, 50); len(one) != 27 || pages != 1 {
		t.Fatalf("limit 50: %d trades / %d pages", len(one), pages)
	}
}

func TestCostsAgreeWithTrades(t *testing.T) {
	e := newEnv(t)
	trades, _ := walkTrades(t, e, 10)

	// walk /costs the same way: same trades, same order
	var costs []api.CostsTrade
	path := "/v1/account/costs?account_id=h1&country=IN&limit=10"
	for {
		var p api.CostsPage
		decode(t, e.want("GET", path, "", 200), &p)
		costs = append(costs, p.Trades...)
		if p.NextBefore == nil {
			break
		}
		path = "/v1/account/costs?account_id=h1&country=IN&limit=10&before=" + url.QueryEscape(p.NextBefore.Format(time.RFC3339))
	}
	if len(costs) != len(trades) {
		t.Fatalf("costs has %d trades, trades has %d", len(costs), len(trades))
	}
	byName := map[string]int64{}
	var grand int64
	sawEmpty := false
	for i, c := range costs {
		if c.TradeId != trades[i].TradeId || c.Total != trades[i].TotalCosts {
			t.Fatalf("costs[%d] %+v disagrees with trade %+v", i, c, trades[i])
		}
		var sum int64
		for _, l := range c.Lines {
			if l.Amount == 0 {
				t.Fatalf("zero line must be omitted: %+v", c)
			}
			sum += l.Amount
			byName[l.Name] += l.Amount
		}
		if sum != c.Total {
			t.Fatalf("lines sum %d != total %d for %s", sum, c.Total, c.TradeId)
		}
		if c.Lines == nil {
			t.Fatal("lines must be [] not null")
		}
		if len(c.Lines) == 0 {
			sawEmpty = true
		}
		grand += c.Total
	}
	if !sawEmpty {
		t.Fatal("expected a trade with no cost lines (exercises the empty-lines case)")
	}

	var sum api.CostsSummary
	decode(t, e.want("GET", "/v1/account/costs/summary?account_id=h1&country=IN", "", 200), &sum)
	if sum.TradeCount != len(trades) || sum.Total != grand {
		t.Fatalf("summary %+v vs trades=%d total=%d", sum, len(trades), grand)
	}
	for _, l := range sum.Lines {
		if byName[l.Name] != l.Amount {
			t.Fatalf("summary line %s = %d, per-trade sum = %d", l.Name, l.Amount, byName[l.Name])
		}
	}
	if len(sum.Lines) != len(byName) {
		t.Fatalf("summary has %d lines, per-trade has %d names", len(sum.Lines), len(byName))
	}
}

func TestPnlAgreesWithTrades(t *testing.T) {
	e := newEnv(t)
	trades, _ := walkTrades(t, e, 50)
	var pnl api.PnlSummary
	decode(t, e.want("GET", "/v1/account/pnl?account_id=h1", "", 200), &pnl)

	var gross, costs, net int64
	wins, losses, breakeven := 0, 0, 0
	for _, tr := range trades {
		gross += tr.GrossPnl
		costs += tr.TotalCosts
		net += tr.NetPnl
		switch {
		case tr.NetPnl > 0:
			wins++
		case tr.NetPnl < 0:
			losses++
		default:
			breakeven++
		}
	}
	if pnl.TradeCount != len(trades) || pnl.GrossPnl != gross || pnl.TotalCosts != costs || pnl.NetPnl != net {
		t.Fatalf("pnl %+v disagrees with trades (n=%d gross=%d costs=%d net=%d)", pnl, len(trades), gross, costs, net)
	}
	if pnl.WinCount != wins || pnl.LossCount != losses {
		t.Fatalf("win/loss %d/%d, want %d/%d", pnl.WinCount, pnl.LossCount, wins, losses)
	}
	if breakeven == 0 || pnl.WinCount+pnl.LossCount != pnl.TradeCount-breakeven {
		t.Fatalf("breakeven (%d) must count in neither win nor loss: %+v", breakeven, pnl)
	}
	if wins == 0 || losses == 0 {
		t.Fatalf("history should contain both wins and losses, got %d/%d", wins, losses)
	}
}

func TestObservationRecentTradesAreTheNewest20(t *testing.T) {
	e := newEnv(t)
	e.join("h2")
	var obs api.Observation
	decode(t, e.want("GET", "/v1/account/observation?account_id=h2", "", 200), &obs)
	trades, _ := walkTrades(t, e, 50)
	if len(obs.RecentTrades) != 20 {
		t.Fatalf("recent_trades: %d, want 20", len(obs.RecentTrades))
	}
	for i, tr := range obs.RecentTrades {
		if tr.TradeId != trades[i].TradeId {
			t.Fatalf("recent_trades[%d] = %s, want %s", i, tr.TradeId, trades[i].TradeId)
		}
	}
}
