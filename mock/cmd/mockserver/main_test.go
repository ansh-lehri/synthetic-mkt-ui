package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
	"github.com/gorilla/websocket"
)

type env struct {
	t   *testing.T
	srv *httptest.Server
}

func newEnv(t *testing.T) *env {
	t.Helper()
	srv := httptest.NewServer(newHandler())
	t.Cleanup(srv.Close)
	return &env{t: t, srv: srv}
}

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

func (e *env) join(acct string) {
	e.t.Helper()
	e.want("POST", "/v1/session/live/join", `{"account_id":"`+acct+`","market":"IN"}`, 200)
}

// ---------------------------------------------------------------- session / reference

func TestReference(t *testing.T) {
	e := newEnv(t)

	var ms api.MarketsResponse
	decode(t, e.want("GET", "/v1/markets", "", 200), &ms)
	if len(ms.Markets) != 1 || ms.Markets[0].Code != "IN" || ms.Markets[0].Timezone != "Asia/Kolkata" {
		t.Fatalf("want exactly one IN market, got %+v", ms.Markets)
	}
	if strings.ContainsAny(ms.Markets[0].LiveSession.OpensAt, "Z+") {
		t.Fatalf("opens_at must be naive-local, got %q", ms.Markets[0].LiveSession.OpensAt)
	}

	var in api.InstrumentsResponse
	decode(t, e.want("GET", "/v1/instruments?market=IN", "", 200), &in)
	if in.Market != "IN" || len(in.Instruments) != 2 {
		t.Fatalf("want 2 IN instruments, got %+v", in)
	}
	for _, i := range in.Instruments {
		if i.TickSize <= 0 || i.LotSize <= 0 || i.PriceDecimals < 0 {
			t.Fatalf("bad formatting contract: %+v", i)
		}
	}
	wantError(t, e.want("GET", "/v1/instruments", "", 400))
	wantError(t, e.want("GET", "/v1/instruments?market=ZZ", "", 400))
}

func TestSessionGate(t *testing.T) {
	e := newEnv(t)

	var st api.SessionState
	decode(t, e.want("GET", "/v1/session?account_id=a1", "", 200), &st)
	if st.Active != nil {
		t.Fatalf("default session must be null, got %+v", st.Active)
	}
	wantError(t, e.want("GET", "/v1/session", "", 400))

	var live api.ActiveSession
	decode(t, e.want("POST", "/v1/session/live/join", `{"account_id":"a1","market":"IN"}`, 200), &live)
	if live.Type != api.Live || live.Market != "IN" {
		t.Fatalf("bad live session: %+v", live)
	}
	decode(t, e.want("GET", "/v1/session?account_id=a1", "", 200), &st)
	if st.Active == nil || st.Active.Type != api.Live {
		t.Fatalf("session should now be active: %+v", st)
	}

	// one-session gate: a second join/start is a 409 reason envelope
	wantReason(t, e.want("POST", "/v1/session/live/join", `{"account_id":"a1","market":"IN"}`, 409), "already_in_session")
	wantReason(t, e.want("POST", "/v1/session/practice/start",
		`{"account_id":"a1","market":"IN","condition":"whipsaw","length_minutes":60}`, 409), "already_in_session")
	// other accounts are independent
	e.want("POST", "/v1/session/live/join", `{"account_id":"a2","market":"IN"}`, 200)

	var ex api.ExitSessionResponse
	decode(t, e.want("POST", "/v1/session/exit", `{"account_id":"a1"}`, 200), &ex)
	if ex.Ok == nil || !*ex.Ok {
		t.Fatal("exit must return ok:true")
	}
	decode(t, e.want("GET", "/v1/session?account_id=a1", "", 200), &st)
	if st.Active != nil {
		t.Fatal("session should be cleared after exit")
	}

	var prac api.ActiveSession
	decode(t, e.want("POST", "/v1/session/practice/start",
		`{"account_id":"a1","market":"IN","condition":"whipsaw","length_minutes":60}`, 200), &prac)
	if prac.Type != api.Practice || prac.Condition == nil || *prac.Condition != api.Whipsaw {
		t.Fatalf("bad practice session: %+v", prac)
	}
	e.want("POST", "/v1/session/exit", `{"account_id":"a1"}`, 200)

	// validation -> 400 error envelope
	wantError(t, e.want("POST", "/v1/session/practice/start",
		`{"account_id":"a1","market":"IN","condition":"nope","length_minutes":60}`, 400))
	wantError(t, e.want("POST", "/v1/session/practice/start",
		`{"account_id":"a1","market":"IN","condition":"whipsaw","length_minutes":10}`, 400))
	wantError(t, e.want("POST", "/v1/session/live/join", `{"account_id":"a1","market":"ZZ"}`, 400))
	wantError(t, e.want("POST", "/v1/session/live/join", `{`, 400))
}

// ---------------------------------------------------------------- live reads: 409 without a session

func TestLiveReadsNeedASession(t *testing.T) {
	e := newEnv(t)
	for _, p := range []string{"balance", "positions", "orders", "observation"} {
		wantError(t, e.want("GET", "/v1/account/"+p+"?account_id=s1", "", 409)) // error envelope, not reason
		wantError(t, e.want("GET", "/v1/account/"+p, "", 400))
	}

	e.join("s1")
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

	e.want("POST", "/v1/session/exit", `{"account_id":"s1"}`, 200)
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
	decode(t, e.want("POST", "/v1/orders/cancel", `{"account_id":"o1","order_id":"o1:3"}`, 202), &oid)
	wantReason(t, e.want("POST", "/v1/orders/cancel", `{"account_id":"o1","order_id":"zz:3"}`, 409), "unknown_order")

	// modify: 200 ok; 409 carries a ModifyResponse (rejected), not an envelope
	var mr api.ModifyResponse
	mod := `{"account_id":"o1","order_id":"o1:3","instrument":"ACME","side":"buy","is_market":false,"new_qty":5,"new_price":10055}`
	decode(t, e.want("POST", "/v1/orders/modify", mod, 200), &mr)
	if mr.ModifyStatus != api.Ok || mr.Replace == nil {
		t.Fatalf("bad modify ok: %+v", mr)
	}
	decode(t, e.want("POST", "/v1/orders/modify", strings.Replace(mod, "o1:3", "zz:3", 1), 409), &mr)
	if mr.ModifyStatus != api.Rejected || mr.Replace != nil {
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

func dialWS(t *testing.T, e *env) *websocket.Conn {
	t.Helper()
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(e.srv.URL, "http")+"/ws", nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	return conn
}

func TestWS(t *testing.T) {
	e := newEnv(t)
	conn := dialWS(t, e)

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
