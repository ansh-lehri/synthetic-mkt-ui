// Package marketdata serves the market-data axis: candle history over HTTP
// (GET /v1/candles) and the live WebSocket (/ws).
//
// Both are driven by internal/market, so they always agree: history is the finalized bars of
// the same price process the socket ticks. The socket follows Model A: a `candle` frame is
// pushed only when a bucket CLOSES; between closes the price moves via `snapshot.last_price`.
package marketdata

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/catalog"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/httpx"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/market"
	"github.com/gorilla/websocket"
)

// wsMarket is the one market the mock socket is bound to. The client never sends a market.
const wsMarket = "IN"

const (
	defaultCandleLimit = 100
	maxCandleLimit     = 500
)

type handler struct{ clock *market.Clock }

// Register mounts the market-data routes on mux.
func Register(mux *http.ServeMux, clock *market.Clock) {
	h := &handler{clock: clock}
	mux.HandleFunc("/v1/candles", httpx.Method(http.MethodGet, h.candles))
	mux.HandleFunc("/ws", h.ws)
}

// candles is a durable read: 200 (incl. empty candles[]) / 400 / 503, never 404/409/504.
// Only FINALIZED bars are returned (a bar exists once its bucket has closed).
func (h *handler) candles(w http.ResponseWriter, r *http.Request) {
	mkt, ok := httpx.RequireQuery(w, r, "market")
	if !ok {
		return
	}
	symbol, ok := httpx.RequireQuery(w, r, "instrument")
	if !ok {
		return
	}
	tf, ok := httpx.RequireQuery(w, r, "timeframe")
	if !ok {
		return
	}
	from, ok := httpx.RequireQuery(w, r, "from")
	if !ok {
		return
	}
	to, ok := httpx.RequireQuery(w, r, "to")
	if !ok {
		return
	}
	step, known := market.Timeframes[tf]
	if !known {
		httpx.WriteError(w, http.StatusBadRequest, "timeframe must be one of 1m, 5m, 30m, 60m")
		return
	}
	tz := catalog.Timezone(mkt)
	if tz == "" {
		httpx.WriteError(w, http.StatusBadRequest, "unknown market: "+mkt)
		return
	}
	inst, found := catalog.Lookup(symbol)
	if !found {
		httpx.WriteError(w, http.StatusBadRequest, "unknown instrument: "+symbol)
		return
	}
	// from/to are naive-local wall-clock values; they are parsed as plain numbers (no zone
	// arithmetic) and no offset is ever emitted.
	start, err := time.Parse(catalog.NaiveLayout, from)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "from must be naive-local ISO-8601, e.g. 2026-10-09T09:15:00")
		return
	}
	end, err := time.Parse(catalog.NaiveLayout, to)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "to must be naive-local ISO-8601, e.g. 2026-10-09T15:30:00")
		return
	}
	if end.Before(start) {
		httpx.WriteError(w, http.StatusBadRequest, "from must not be after to")
		return
	}
	limit, ok := httpx.OptionalLimit(w, r, defaultCandleLimit)
	if !ok {
		return
	}
	limit = min(limit, maxCandleLimit) // oversized -> clamp

	// Buckets are enumerable in order, so the cursor is just the next index.
	first := 0
	if c := r.URL.Query().Get("cursor"); c != "" {
		n, err := strconv.Atoi(c)
		if err != nil || n < 0 {
			httpx.WriteError(w, http.StatusBadRequest, "invalid cursor")
			return
		}
		first = n
	}
	buckets := market.BucketsInRange(step, start, end, h.clock.Read().Local)

	candles := make([]api.Bar, 0, limit)
	for i := first; i < len(buckets) && len(candles) < limit; i++ {
		candles = append(candles, market.BarFor(inst, buckets[i]))
	}
	var next *string
	if first+len(candles) < len(buckets) {
		c := strconv.Itoa(first + len(candles))
		next = &c
	}

	httpx.WriteJSON(w, http.StatusOK, api.CandleResponse{
		Market:     mkt,
		Instrument: symbol,
		Timeframe:  api.CandleResponseTimeframe(tf),
		Timezone:   tz,
		From:       from,
		To:         to,
		Candles:    candles,
		NextCursor: next, // null = last page
	})
}

// ---------------------------------------------------------------- /ws

// upgrader accepts any origin: the mock is CORS-open for local development.
var upgrader = websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

type candleKey struct{ symbol, tf string }

// conn is one client socket and its subscriptions. A single mutex serializes writes because
// the reader goroutine (acks, seeds) and the ticker goroutine (pushes) both write.
type conn struct {
	ws    *websocket.Conn
	clock *market.Clock

	wmu sync.Mutex // serializes writes

	mu      sync.Mutex              // guards the subscription state below
	snaps   map[string][]byte       // symbol -> last snapshot bytes sent (de-dupes unchanged pushes)
	candles map[candleKey]time.Time // -> end of the last bucket pushed (naive-local)
}

func (c *conn) write(v any) error {
	c.wmu.Lock()
	defer c.wmu.Unlock()
	return c.ws.WriteJSON(v)
}

func (h *handler) ws(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return // Upgrade has already written the HTTP error.
	}
	defer ws.Close()

	c := &conn{ws: ws, clock: h.clock, snaps: map[string][]byte{}, candles: map[candleKey]time.Time{}}
	if err := c.write(api.WsConnected{Type: api.WsTypeConnected, Market: wsMarket, Timezone: catalog.Timezone(wsMarket)}); err != nil {
		log.Printf("ws: write connected: %v", err)
		return
	}

	done := make(chan struct{})
	defer close(done)
	go c.tickLoop(done)

	// The reader handles subscribe/unsubscribe. Unparseable frames and unknown message types
	// are ignored: the contract defines no error frame.
	for {
		_, raw, err := ws.ReadMessage()
		if err != nil {
			return
		}
		var env api.WsEnvelope
		if err := json.Unmarshal(raw, &env); err != nil {
			log.Printf("ws: ignoring non-JSON frame: %v", err)
			continue
		}
		switch env.Type {
		case api.WsTypeSubscribe, api.WsTypeUnsubscribe:
			var msg api.WsSubscribe
			if err := json.Unmarshal(raw, &msg); err != nil {
				log.Printf("ws: ignoring malformed %s frame: %v", env.Type, err)
				continue
			}
			if !c.handleSubs(env.Type == api.WsTypeSubscribe, msg.Subs) {
				return
			}
		}
	}
}

// handleSubs replies with one ack carrying a result per sub, then pushes the seed snapshot
// for each ACCEPTED snapshot subscribe (a candle sub is bare: history is over HTTP).
// Returns false when a write fails and the connection should close.
func (c *conn) handleSubs(subscribe bool, subs []api.WsSub) bool {
	r := c.clock.Read()
	results := make([]api.WsAckResult, 0, len(subs))
	var seeds []api.WsSnapshot

	c.mu.Lock()
	for _, s := range subs {
		res := api.WsAckResult{Stream: s.Stream, Instrument: s.Instrument, Timeframe: s.Timeframe, Status: api.WsAckOK}
		inst, known := catalog.Lookup(s.Instrument)
		switch {
		case s.Stream != api.WsStreamCandle && s.Stream != api.WsStreamSnapshot:
			res.Status, res.Error = api.WsAckError, api.WsErrBadStream
		case !known:
			res.Status, res.Error = api.WsAckError, api.WsErrUnknownInstrument
		case s.Stream == api.WsStreamCandle:
			if _, ok := market.Timeframes[s.Timeframe]; !ok {
				res.Status, res.Error = api.WsAckError, api.WsErrBadTimeframe
			}
		}
		if res.Status == api.WsAckOK {
			key := candleKey{s.Instrument, s.Timeframe}
			switch {
			case subscribe && s.Stream == api.WsStreamSnapshot:
				snap := market.Snapshot(inst, r)
				raw, _ := json.Marshal(snap)
				c.snaps[s.Instrument] = raw
				seeds = append(seeds, snap)
			case subscribe && s.Stream == api.WsStreamCandle:
				if _, already := c.candles[key]; !already {
					c.candles[key] = r.Local // only buckets that close AFTER now are pushed
				}
			case !subscribe && s.Stream == api.WsStreamSnapshot:
				delete(c.snaps, s.Instrument)
			case !subscribe && s.Stream == api.WsStreamCandle:
				delete(c.candles, key)
			}
		}
		results = append(results, res)
	}
	c.mu.Unlock()

	if err := c.write(api.WsAck{Type: api.WsTypeAck, Results: results}); err != nil {
		return false
	}
	for _, snap := range seeds {
		if err := c.write(snap); err != nil {
			return false
		}
	}
	return true
}

// tickLoop pushes, once per price step: a fresh snapshot for each snapshot subscription
// (only if it changed) and a `candle` frame for every bucket that has just closed.
func (c *conn) tickLoop(done <-chan struct{}) {
	t := time.NewTicker(c.clock.StepInterval())
	defer t.Stop()
	for {
		select {
		case <-done:
			return
		case <-t.C:
			if !c.pushDue() {
				return
			}
		}
	}
}

func (c *conn) pushDue() bool {
	r := c.clock.Read()

	c.mu.Lock()
	var out []any
	for sym, prev := range c.snaps {
		inst, _ := catalog.Lookup(sym)
		snap := market.Snapshot(inst, r)
		raw, _ := json.Marshal(snap)
		if string(raw) != string(prev) { // "whole picture re-emitted on any change"
			c.snaps[sym] = raw
			out = append(out, snap)
		}
	}
	for key, after := range c.candles {
		inst, _ := catalog.Lookup(key.symbol)
		step := market.Timeframes[key.tf]
		for _, b := range market.ClosedSince(step, after, r.Local) {
			out = append(out, api.WsCandle{Type: api.WsTypeCandle, Instrument: key.symbol, Timeframe: key.tf, Bar: market.BarFor(inst, b)})
			after = b.End
		}
		c.candles[key] = after
	}
	c.mu.Unlock()

	for _, m := range out {
		if err := c.write(m); err != nil {
			return false
		}
	}
	return true
}
