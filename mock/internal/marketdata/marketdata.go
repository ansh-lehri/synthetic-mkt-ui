// Package marketdata serves the market-data axis: candle history over HTTP
// (GET /v1/candles) and the live WebSocket (/ws).
//
// Skeleton behaviour: candles are a deterministic series on the tick grid (not a market
// model); /ws answers subscribe/unsubscribe with per-sub acks and seeds a STATIC snapshot
// for accepted snapshot subs. No candle pushes and no moving prices yet (Model A realism
// is a later phase — see contract/ws-schemas.md "Mock obligations").
package marketdata

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/catalog"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/httpx"
	"github.com/gorilla/websocket"
)

// wsMarket is the one market the mock socket is bound to. The client never sends a market.
const wsMarket = "IN"

const (
	defaultCandleLimit = 100
	maxCandleLimit     = 500
)

var timeframes = map[string]time.Duration{
	"1m":  time.Minute,
	"5m":  5 * time.Minute,
	"30m": 30 * time.Minute,
	"60m": 60 * time.Minute,
}

// Register mounts the market-data routes on mux.
func Register(mux *http.ServeMux) {
	mux.HandleFunc("/v1/candles", httpx.Method(http.MethodGet, handleCandles))
	mux.HandleFunc("/ws", handleWS)
}

// handleCandles is a durable read: 200 (incl. empty candles[]) / 400 / 503, never 404/409/504.
func handleCandles(w http.ResponseWriter, r *http.Request) {
	market, ok := httpx.RequireQuery(w, r, "market")
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
	step, known := timeframes[tf]
	if !known {
		httpx.WriteError(w, http.StatusBadRequest, "timeframe must be one of 1m, 5m, 30m, 60m")
		return
	}
	tz := catalog.Timezone(market)
	if tz == "" {
		httpx.WriteError(w, http.StatusBadRequest, "unknown market: "+market)
		return
	}
	inst, found := catalog.Lookup(symbol)
	if !found {
		httpx.WriteError(w, http.StatusBadRequest, "unknown instrument: "+symbol)
		return
	}
	// from/to are naive-local wall-clock values; they are parsed in UTC purely as numbers
	// (no zone arithmetic) and no offset is ever emitted.
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

	// Bars are addressable by index from `from`, so the cursor is just the next index.
	first := 0
	if c := r.URL.Query().Get("cursor"); c != "" {
		n, err := strconv.Atoi(c)
		if err != nil || n < 0 {
			httpx.WriteError(w, http.StatusBadRequest, "invalid cursor")
			return
		}
		first = n
	}
	total := 0
	if end.After(start) {
		total = int((end.Sub(start) + step - 1) / step) // bars covering [from, to)
	}

	candles := make([]api.Bar, 0, limit)
	for i := first; i < total && len(candles) < limit; i++ {
		candles = append(candles, bar(inst, i, start.Add(time.Duration(i)*step), step))
	}
	var next *string
	if first+len(candles) < total {
		c := strconv.Itoa(first + len(candles))
		next = &c
	}

	httpx.WriteJSON(w, http.StatusOK, api.CandleResponse{
		Market:     market,
		Instrument: symbol,
		Timeframe:  api.CandleResponseTimeframe(tf),
		Timezone:   tz,
		From:       from,
		To:         to,
		Candles:    candles,
		NextCursor: next, // null = last page
	})
}

// bar builds the i-th placeholder bar: a deterministic walk on the instrument's tick grid.
// Not a market model.
func bar(inst catalog.Instrument, i int, t time.Time, step time.Duration) api.Bar {
	tick := inst.TickSize
	walk := func(n int) int64 { return inst.RefPrice + int64((n*7)%9-4)*tick }
	open, closePx := walk(i), walk(i+1)
	return api.Bar{
		Start:  t.Format(catalog.NaiveLayout),
		End:    t.Add(step).Format(catalog.NaiveLayout),
		Open:   open,
		High:   max(open, closePx) + tick,
		Low:    min(open, closePx) - tick,
		Close:  closePx,
		Volume: int64(1000 + (i%10)*100),
	}
}

// ---------------------------------------------------------------- /ws

// upgrader accepts any origin: the mock is CORS-open for local development.
var upgrader = websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

func handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return // Upgrade has already written the HTTP error.
	}
	defer conn.Close()

	if err := conn.WriteJSON(api.WsConnected{
		Type:     api.WsTypeConnected,
		Market:   wsMarket,
		Timezone: catalog.Timezone(wsMarket),
	}); err != nil {
		log.Printf("ws: write connected: %v", err)
		return
	}

	// One goroutine reads and replies, so writes never interleave. Unparseable frames and
	// unknown message types are ignored: the contract defines no error frame.
	for {
		var env api.WsEnvelope
		_, raw, err := conn.ReadMessage()
		if err != nil {
			return
		}
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
			if !handleSubs(conn, env.Type == api.WsTypeSubscribe, msg.Subs) {
				return
			}
		}
	}
}

// handleSubs replies with one ack carrying a result per sub. For each ACCEPTED snapshot
// subscribe it then pushes the seed snapshot (a candle sub is bare: history is over HTTP).
// Returns false when a write fails and the connection should close.
func handleSubs(conn *websocket.Conn, subscribe bool, subs []api.WsSub) bool {
	results := make([]api.WsAckResult, 0, len(subs))
	var seeds []api.WsSnapshot
	for _, s := range subs {
		res := api.WsAckResult{Stream: s.Stream, Instrument: s.Instrument, Timeframe: s.Timeframe, Status: api.WsAckOK}
		inst, known := catalog.Lookup(s.Instrument)
		switch {
		case s.Stream != api.WsStreamCandle && s.Stream != api.WsStreamSnapshot:
			res.Status, res.Error = api.WsAckError, api.WsErrBadStream
		case !known:
			res.Status, res.Error = api.WsAckError, api.WsErrUnknownInstrument
		case s.Stream == api.WsStreamCandle:
			if _, ok := timeframes[s.Timeframe]; !ok {
				res.Status, res.Error = api.WsAckError, api.WsErrBadTimeframe
			}
		}
		if res.Status == api.WsAckOK && subscribe && s.Stream == api.WsStreamSnapshot {
			seeds = append(seeds, snapshot(inst))
		}
		results = append(results, res)
	}
	if err := conn.WriteJSON(api.WsAck{Type: api.WsTypeAck, Results: results}); err != nil {
		return false
	}
	for _, snap := range seeds {
		if err := conn.WriteJSON(snap); err != nil {
			return false
		}
	}
	return true
}

// snapshot is the static seed picture: open phase, a last price on the tick grid, a
// one-tick spread and 5 levels per side, best-first. Every optional numeric has its has_*
// flag set; 0 would still be a valid price.
func snapshot(inst catalog.Instrument) api.WsSnapshot {
	tick := inst.TickSize
	bid, ask := inst.RefPrice-tick, inst.RefPrice+tick
	var bids, asks []api.WsDepthLevel
	for i := int64(0); i < 5; i++ {
		bids = append(bids, api.WsDepthLevel{Price: bid - i*tick, Qty: 300 - i*40})
		asks = append(asks, api.WsDepthLevel{Price: ask + i*tick, Qty: 150 + i*60})
	}
	return api.WsSnapshot{
		Type:       api.WsTypeSnapshot,
		Instrument: inst.Symbol,
		Data: api.WsSnapshotData{
			Phase:     "open",
			LastPrice: inst.RefPrice,
			HasLast:   true,
			ChangePct: 1.37,
			Quote: api.WsQuote{
				BestBid: bid, BidQty: bids[0].Qty, HasBid: true,
				BestAsk: ask, AskQty: asks[0].Qty, HasAsk: true,
			},
			Depth: api.WsDepth{Bids: bids, Asks: asks},
		},
	}
}
