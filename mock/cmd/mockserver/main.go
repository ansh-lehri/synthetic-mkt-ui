// Command mockserver runs the Synthetic Market Simulator mock backend: the REST contract
// (contract/openapi.yaml) plus the market-data WebSocket (contract/ws-schemas.md), on one
// http.ServeMux and one port. The real Go backend is a drop-in: the frontend swaps it in
// by changing VITE_API_BASE / VITE_WS_BASE.
package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"time"

	_ "time/tzdata" // market timezones must resolve even on minimal images

	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/broker"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/catalog"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/httpx"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/market"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/marketdata"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/session"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/store"
)

func main() {
	defaultAddr := ":8080"
	if v := os.Getenv("MOCK_ADDR"); v != "" {
		defaultAddr = v
	}
	addr := flag.String("addr", defaultAddr, "listen address (env MOCK_ADDR)")
	flag.Parse()

	srv := &http.Server{
		Addr:              *addr,
		Handler:           newHandler(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("mockserver listening on %s", *addr)
	log.Fatal(srv.ListenAndServe())
}

// newHandler builds the full mock with the real session clock (paced by MOCK_SPEED).
func newHandler() http.Handler {
	m, _ := catalog.FindMarket("IN")
	return newHandlerWith(market.NewDefaultClock(m.Location()))
}

// newHandlerWith builds the mock around a given clock (tests inject a fake one): all three
// route packages on one mux, CORS-open.
func newHandlerWith(clock *market.Clock, brokerCfg ...broker.Config) http.Handler {
	cfg := broker.DefaultConfig()
	if len(brokerCfg) > 0 {
		cfg = brokerCfg[0] // tests inject a fake wall clock and fill delays
	}
	sessions := store.NewSessions() // the only mutable state besides the clock: which session each account is in
	mux := http.NewServeMux()
	broker.Register(mux, sessions, cfg)
	marketdata.Register(mux, clock)
	session.Register(mux, sessions, clock)
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteError(w, http.StatusNotFound, "not found")
	})
	return httpx.CORS(mux)
}
