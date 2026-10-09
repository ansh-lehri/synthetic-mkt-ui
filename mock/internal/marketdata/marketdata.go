// Package marketdata serves the market-data axis: candle history over HTTP
// (GET /v1/candles) and the live WebSocket (/ws).
//
// Phase 0: /v1/candles returns a small deterministic placeholder series, and /ws only
// upgrades and sends the `connected` frame. Subscriptions, acks, snapshots and candle
// pushes (Model A) arrive in Phase 3 — see contract/ws-schemas.md "Mock obligations".
package marketdata

import (
	"log"
	"net/http"
	"time"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/httpx"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/session"
	"github.com/gorilla/websocket"
)

// naiveLayout is the naive-local ISO-8601 layout (no offset); tz travels in `timezone`.
const naiveLayout = "2006-01-02T15:04:05"

// wsMarket is the one market the mock socket is bound to. The client never sends a market.
const wsMarket = "IN"

// maxPlaceholderBars caps the placeholder series.
const maxPlaceholderBars = 12

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

func handleCandles(w http.ResponseWriter, r *http.Request) {
	market, ok := httpx.RequireQuery(w, r, "market")
	if !ok {
		return
	}
	instrument, ok := httpx.RequireQuery(w, r, "instrument")
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
	tz := session.Timezone(market)
	if tz == "" {
		httpx.WriteError(w, http.StatusBadRequest, "unknown market: "+market)
		return
	}
	// from/to are naive-local; parse them in UTC purely as wall-clock values (the client
	// never touches UTC and neither do we — no offset is ever emitted).
	start, err := time.Parse(naiveLayout, from)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "from must be naive-local ISO-8601, e.g. 2026-10-09T09:15:00")
		return
	}
	end, err := time.Parse(naiveLayout, to)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "to must be naive-local ISO-8601, e.g. 2026-10-09T15:30:00")
		return
	}

	candles := make([]api.Bar, 0, maxPlaceholderBars)
	price := int64(10050)
	for t := start; t.Before(end) && len(candles) < maxPlaceholderBars; t = t.Add(step) {
		// Deterministic wobble, multiples of the 5-unit tick. Not a market model.
		drift := int64(len(candles)%4-1) * 5
		open, closePx := price, price+drift
		candles = append(candles, api.Bar{
			Start:  t.Format(naiveLayout),
			End:    t.Add(step).Format(naiveLayout),
			Open:   open,
			High:   max(open, closePx) + 10,
			Low:    min(open, closePx) - 10,
			Close:  closePx,
			Volume: 1000 + int64(len(candles))*100,
		})
		price = closePx
	}

	httpx.WriteJSON(w, http.StatusOK, api.CandleResponse{
		Market:     market,
		Instrument: instrument,
		Timeframe:  api.CandleResponseTimeframe(tf),
		Timezone:   tz,
		From:       from,
		To:         to,
		Candles:    candles,
		NextCursor: nil, // last page
	})
}

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
		Timezone: session.Timezone(wsMarket),
	}); err != nil {
		log.Printf("ws: write connected: %v", err)
		return
	}

	// Phase 0: keep the socket open and drain client frames (this also services ping/pong
	// and close control frames). Subscribe/unsubscribe handling lands in Phase 3.
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			return
		}
	}
}
