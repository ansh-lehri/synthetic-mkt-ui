// Package session serves the session/reference axis (PROVISIONAL contract):
// /v1/markets, /v1/instruments, /v1/session, /v1/session/live/join,
// /v1/session/practice/start, /v1/session/exit.
//
// Phase 0: valid, correctly-shaped placeholder responses only. No session state is kept.
package session

import (
	"net/http"
	"time"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/httpx"
)

// naiveLayout is the naive-local ISO-8601 layout: no offset, no "Z". The tz is carried
// separately in a `timezone` field.
const naiveLayout = "2006-01-02T15:04:05"

type marketDef struct {
	code, name, tz string
	openH, openM   int
	closeH, closeM int
}

var markets = []marketDef{
	{code: "IN", name: "India", tz: "Asia/Kolkata", openH: 9, openM: 15, closeH: 15, closeM: 30},
	{code: "US", name: "United States", tz: "America/New_York", openH: 9, openM: 30, closeH: 16, closeM: 0},
}

// Timezone returns the IANA timezone of a market code, or "" if the market is unknown.
func Timezone(code string) string {
	for _, m := range markets {
		if m.code == code {
			return m.tz
		}
	}
	return ""
}

func findMarket(code string) (marketDef, bool) {
	for _, m := range markets {
		if m.code == code {
			return m, true
		}
	}
	return marketDef{}, false
}

// sessionTimes returns today's open/close for a market as naive-local ISO strings.
func sessionTimes(m marketDef) (opens, closes string) {
	loc, err := time.LoadLocation(m.tz)
	if err != nil {
		loc = time.UTC
	}
	now := time.Now().In(loc)
	o := time.Date(now.Year(), now.Month(), now.Day(), m.openH, m.openM, 0, 0, loc)
	c := time.Date(now.Year(), now.Month(), now.Day(), m.closeH, m.closeM, 0, 0, loc)
	return o.Format(naiveLayout), c.Format(naiveLayout)
}

// Register mounts the session/reference routes on mux.
func Register(mux *http.ServeMux) {
	mux.HandleFunc("/v1/markets", httpx.Method(http.MethodGet, handleMarkets))
	mux.HandleFunc("/v1/instruments", httpx.Method(http.MethodGet, handleInstruments))
	mux.HandleFunc("/v1/session", httpx.Method(http.MethodGet, handleSession))
	mux.HandleFunc("/v1/session/live/join", httpx.Method(http.MethodPost, handleJoinLive))
	mux.HandleFunc("/v1/session/practice/start", httpx.Method(http.MethodPost, handleStartPractice))
	mux.HandleFunc("/v1/session/exit", httpx.Method(http.MethodPost, handleExit))
}

func handleMarkets(w http.ResponseWriter, _ *http.Request) {
	out := api.MarketsResponse{Markets: make([]api.Market, 0, len(markets))}
	for _, m := range markets {
		opens, closes := sessionTimes(m)
		out.Markets = append(out.Markets, api.Market{
			Code:     m.code,
			Name:     m.name,
			Timezone: m.tz,
			LiveSession: api.LiveSessionInfo{
				Phase:    api.LiveSessionInfoPhaseOpen,
				OpensAt:  opens,
				ClosesAt: closes,
			},
		})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func handleInstruments(w http.ResponseWriter, r *http.Request) {
	code, ok := httpx.RequireQuery(w, r, "market")
	if !ok {
		return
	}
	if _, found := findMarket(code); !found {
		httpx.WriteError(w, http.StatusBadRequest, "unknown market: "+code)
		return
	}
	// Invented instruments only. Prices are bare int64 raw units; tick_size is the smallest
	// price increment in those raw units and price_decimals is how many decimals to show.
	httpx.WriteJSON(w, http.StatusOK, api.InstrumentsResponse{
		Market: code,
		Instruments: []api.Instrument{
			{Instrument: "ACME", Name: "Acme Industries", TickSize: 5, LotSize: 1, PriceDecimals: 2},
			{Instrument: "BETA", Name: "Beta Holdings", TickSize: 5, LotSize: 1, PriceDecimals: 2},
			{Instrument: "GAMA", Name: "Gama Works", TickSize: 1, LotSize: 10, PriceDecimals: 2},
		},
	})
}

func handleSession(w http.ResponseWriter, r *http.Request) {
	if _, ok := httpx.RequireQuery(w, r, "account_id"); !ok {
		return
	}
	// Placeholder: the account is in no session.
	httpx.WriteJSON(w, http.StatusOK, api.SessionState{Active: nil})
}

func handleJoinLive(w http.ResponseWriter, r *http.Request) {
	var req api.JoinLiveRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	if req.AccountId == "" || req.Market == "" {
		httpx.WriteError(w, http.StatusBadRequest, "account_id and market are required")
		return
	}
	m, ok := findMarket(req.Market)
	if !ok {
		httpx.WriteError(w, http.StatusBadRequest, "unknown market: "+req.Market)
		return
	}
	_, closes := sessionTimes(m)
	httpx.WriteJSON(w, http.StatusOK, api.ActiveSession{
		Type:     api.Live,
		Market:   m.code,
		Phase:    api.ActiveSessionPhaseOpen,
		ClosesAt: &closes,
	})
}

func handleStartPractice(w http.ResponseWriter, r *http.Request) {
	var req api.StartPracticeRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	if req.AccountId == "" || req.Market == "" {
		httpx.WriteError(w, http.StatusBadRequest, "account_id and market are required")
		return
	}
	if _, ok := findMarket(req.Market); !ok {
		httpx.WriteError(w, http.StatusBadRequest, "unknown market: "+req.Market)
		return
	}
	switch req.Condition {
	case api.NormalDay, api.CalmRange, api.TrendingDay, api.Whipsaw, api.UnstableDay, api.ThinLiquidity:
	default:
		httpx.WriteError(w, http.StatusBadRequest, "unknown condition: "+string(req.Condition))
		return
	}
	switch req.LengthMinutes {
	case 60, 75, 90, 105:
	default:
		httpx.WriteError(w, http.StatusBadRequest, "length_minutes must be one of 60, 75, 90, 105")
		return
	}
	loc, err := time.LoadLocation(Timezone(req.Market))
	if err != nil {
		loc = time.UTC
	}
	ends := time.Now().In(loc).Add(time.Duration(req.LengthMinutes) * time.Minute).Format(naiveLayout)
	cond := req.Condition
	httpx.WriteJSON(w, http.StatusOK, api.ActiveSession{
		Type:      api.Practice,
		Market:    req.Market,
		Phase:     api.ActiveSessionPhaseOpen,
		ClosesAt:  &ends,
		Condition: &cond,
	})
}

func handleExit(w http.ResponseWriter, r *http.Request) {
	var req api.ExitSessionRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	if req.AccountId == "" {
		httpx.WriteError(w, http.StatusBadRequest, "account_id is required")
		return
	}
	ok := true
	httpx.WriteJSON(w, http.StatusOK, api.ExitSessionResponse{Ok: &ok})
}
