package main

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
	"github.com/gorilla/websocket"
)

// readFrame reads the next frame and decodes its type discriminator + raw body.
func readFrame(t *testing.T, conn *websocket.Conn) (string, []byte) {
	t.Helper()
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	_, raw, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	var env api.WsEnvelope
	if err := json.Unmarshal(raw, &env); err != nil {
		t.Fatal(err)
	}
	return env.Type, raw
}

// nextOfType skips frames until one of the wanted type arrives.
func nextOfType(t *testing.T, conn *websocket.Conn, want string) []byte {
	t.Helper()
	for i := 0; i < 50; i++ {
		typ, raw := readFrame(t, conn)
		if typ == want {
			return raw
		}
	}
	t.Fatalf("no %q frame arrived", want)
	return nil
}

func subscribe(t *testing.T, conn *websocket.Conn, subs string) {
	t.Helper()
	if err := conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"subscribe","subs":[`+subs+`]}`)); err != nil {
		t.Fatal(err)
	}
}

func TestMarketsFollowTheSessionClock(t *testing.T) {
	e := newEnv(t) // sim 10:00 on day 0
	phase := func() api.LiveSessionInfo {
		var ms api.MarketsResponse
		decode(t, e.want("GET", "/v1/markets", "", 200), &ms)
		return ms.Markets[0].LiveSession
	}
	if ls := phase(); ls.Phase != "open" || ls.OpensAt != "2026-10-12T09:15:00" || ls.ClosesAt != "2026-10-12T15:30:00" {
		t.Fatalf("at 10:00: %+v", ls)
	}
	e.advanceSim(5*time.Hour + 15*time.Minute) // 15:15
	if ls := phase(); ls.Phase != "closing" {
		t.Fatalf("at 15:15: %+v", ls)
	}
	e.advanceSim(15 * time.Minute) // 15:30
	if ls := phase(); ls.Phase != "closed" {
		t.Fatalf("at 15:30: %+v", ls)
	}
	e.wall.advance(31 * time.Second) // past the closed hold -> next day, preopen
	if ls := phase(); ls.Phase != "preopen" || ls.OpensAt != "2026-10-13T09:15:00" {
		t.Fatalf("next morning: %+v", ls)
	}

	// a live session reports the market's CURRENT phase, not a stored one
	e.join("p1")
	var st api.SessionState
	decode(t, e.want("GET", "/v1/session?account_id=p1", "", 200), &st)
	if st.Active == nil || st.Active.Phase != "preopen" {
		t.Fatalf("live session phase should follow the clock: %+v", st.Active)
	}
	e.advanceSim(20 * time.Minute) // 09:20, open
	decode(t, e.want("GET", "/v1/session?account_id=p1", "", 200), &st)
	if st.Active.Phase != "open" {
		t.Fatalf("after the open: %+v", st.Active)
	}
}

func TestCandlesOnlyReturnClosedBarsAndAdvanceWithTheClock(t *testing.T) {
	e := newEnv(t) // 10:00 on 2026-10-12
	path := "/v1/candles?market=IN&instrument=ACME&timeframe=5m&from=2026-10-12T09:15:00&to=2026-10-12T15:30:00"
	var cr api.CandleResponse
	decode(t, e.want("GET", path, "", 200), &cr)
	if len(cr.Candles) != 9 || cr.Candles[8].End != "2026-10-12T10:00:00" {
		t.Fatalf("at 10:00 want 9 closed 5m bars ending 10:00, got %d (last %+v)", len(cr.Candles), cr.Candles[len(cr.Candles)-1])
	}
	e.advanceSim(7 * time.Minute) // 10:07 -> the 10:00-10:05 bar has closed, 10:05-10:10 has not
	decode(t, e.want("GET", path, "", 200), &cr)
	if len(cr.Candles) != 10 || cr.Candles[9].End != "2026-10-12T10:05:00" {
		t.Fatalf("at 10:07 want 10 bars, got %d", len(cr.Candles))
	}
	// the day before is entirely history
	decode(t, e.want("GET", strings.Replace(path, "2026-10-12", "2026-10-09", 2), "", 200), &cr)
	if len(cr.Candles) != 75 {
		t.Fatalf("a past 5m day has 75 bars, got %d", len(cr.Candles))
	}
}

func TestWSSnapshotsMoveAndCarryThePhase(t *testing.T) {
	e := newEnv(t)
	conn := dialWS(t, e)
	readFrame(t, conn) // connected
	subscribe(t, conn, `{"stream":"snapshot","instrument":"ACME"}`)
	nextOfType(t, conn, "ack")

	var first api.WsSnapshot
	if err := json.Unmarshal(nextOfType(t, conn, "snapshot"), &first); err != nil {
		t.Fatal(err)
	}
	if first.Data.Phase != "open" || !first.Data.Quote.HasBid {
		t.Fatalf("seed: %+v", first.Data)
	}

	// advance the simulated clock: the server pushes a NEW snapshot with a different book
	e.advanceSim(2 * time.Minute)
	var next api.WsSnapshot
	if err := json.Unmarshal(nextOfType(t, conn, "snapshot"), &next); err != nil {
		t.Fatal(err)
	}
	if next.Data.Depth.Bids[0].Qty == first.Data.Depth.Bids[0].Qty && next.Data.Depth.Asks[0].Qty == first.Data.Depth.Asks[0].Qty && next.Data.LastPrice == first.Data.LastPrice {
		t.Fatalf("the pushed snapshot did not change: %+v", next.Data)
	}

	// cross the close: phase flips and the book disappears (has_* false), re-emitted by the server
	e.advanceSim(5*time.Hour + 30*time.Minute) // well past 15:30
	deadline := time.Now().Add(5 * time.Second)
	for {
		var s api.WsSnapshot
		if err := json.Unmarshal(nextOfType(t, conn, "snapshot"), &s); err != nil {
			t.Fatal(err)
		}
		if s.Data.Phase == "closed" {
			if s.Data.Quote.HasBid || s.Data.Quote.HasAsk || len(s.Data.Depth.Bids) != 0 || !s.Data.HasLast {
				t.Fatalf("closed snapshot must have a last price and no book: %+v", s.Data)
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("never saw the closed phase")
		}
	}
}

func TestWSPushesClosedBarsAndTheyMatchHistory(t *testing.T) {
	e := newEnv(t) // 10:00:00
	conn := dialWS(t, e)
	readFrame(t, conn)
	subscribe(t, conn, `{"stream":"candle","instrument":"ACME","timeframe":"1m"},{"stream":"candle","instrument":"BETA","timeframe":"5m"}`)
	nextOfType(t, conn, "ack")

	// Model A: nothing is pushed for a candle sub until a bucket closes
	e.advanceSim(2*time.Minute + 30*time.Second) // 10:02:30 -> the 10:01 and 10:02 1m bars closed; no 5m bar yet
	var got []api.WsCandle
	for len(got) < 2 {
		var c api.WsCandle
		if err := json.Unmarshal(nextOfType(t, conn, "candle"), &c); err != nil {
			t.Fatal(err)
		}
		got = append(got, c)
	}
	if got[0].Instrument != "ACME" || got[0].Timeframe != "1m" || got[0].Bar.Start != "2026-10-12T10:00:00" || got[0].Bar.End != "2026-10-12T10:01:00" {
		t.Fatalf("first pushed bar: %+v", got[0])
	}
	if got[1].Bar.Start != "2026-10-12T10:01:00" {
		t.Fatalf("bars must be pushed in order, got %+v", got[1])
	}

	// the pushed bar is IDENTICAL to what history returns for the same bucket
	var cr api.CandleResponse
	decode(t, e.want("GET", "/v1/candles?market=IN&instrument=ACME&timeframe=1m&from=2026-10-12T10:00:00&to=2026-10-12T10:02:00", "", 200), &cr)
	if len(cr.Candles) != 2 || cr.Candles[0] != got[0].Bar || cr.Candles[1] != got[1].Bar {
		t.Fatalf("pushed bars differ from history:\n pushed  %+v\n history %+v", []api.Bar{got[0].Bar, got[1].Bar}, cr.Candles)
	}

	// the 5m BETA bar closes at 10:05: it arrives only then
	e.advanceSim(3 * time.Minute) // 10:05:30
	for {
		var c api.WsCandle
		if err := json.Unmarshal(nextOfType(t, conn, "candle"), &c); err != nil {
			t.Fatal(err)
		}
		if c.Instrument == "BETA" {
			if c.Timeframe != "5m" || c.Bar.Start != "2026-10-12T10:00:00" || c.Bar.End != "2026-10-12T10:05:00" {
				t.Fatalf("BETA 5m bar: %+v", c)
			}
			break
		}
	}
}

func TestWSUnsubscribeStopsPushes(t *testing.T) {
	e := newEnv(t)
	conn := dialWS(t, e)
	readFrame(t, conn)
	subscribe(t, conn, `{"stream":"snapshot","instrument":"ACME"}`)
	nextOfType(t, conn, "ack")
	nextOfType(t, conn, "snapshot")
	if err := conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"unsubscribe","subs":[{"stream":"snapshot","instrument":"ACME"}]}`)); err != nil {
		t.Fatal(err)
	}
	nextOfType(t, conn, "ack")
	e.advanceSim(10 * time.Minute)
	conn.SetReadDeadline(time.Now().Add(1500 * time.Millisecond))
	if _, raw, err := conn.ReadMessage(); err == nil {
		t.Fatalf("a frame arrived after unsubscribe: %s", raw)
	}
}
