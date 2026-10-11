// Package session serves the session/reference axis (PROVISIONAL contract):
// /v1/markets, /v1/instruments, /v1/session, /v1/session/live/join,
// /v1/session/practice/start, /v1/session/exit.
//
// Reference data is static; session state lives in store.Sessions and enforces the
// one-session gate (a second join/start is a 409 until the account exits).
package session

import (
	"net/http"
	"time"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/catalog"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/httpx"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/market"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/store"
)

type handler struct {
	sessions *store.Sessions
	clock    *market.Clock // the session clock: drives every live phase and the day's window
}

// Register mounts the session/reference routes on mux.
func Register(mux *http.ServeMux, sessions *store.Sessions, clock *market.Clock) {
	h := &handler{sessions: sessions, clock: clock}
	mux.HandleFunc("/v1/markets", httpx.Method(http.MethodGet, h.markets))
	mux.HandleFunc("/v1/instruments", httpx.Method(http.MethodGet, h.instruments))
	mux.HandleFunc("/v1/session", httpx.Method(http.MethodGet, h.state))
	mux.HandleFunc("/v1/session/live/join", httpx.Method(http.MethodPost, h.joinLive))
	mux.HandleFunc("/v1/session/practice/start", httpx.Method(http.MethodPost, h.startPractice))
	mux.HandleFunc("/v1/session/exit", httpx.Method(http.MethodPost, h.exit))
}

func (h *handler) markets(w http.ResponseWriter, _ *http.Request) {
	r := h.clock.Read()
	opens, closes := market.Open(r.Day).Format(catalog.NaiveLayout), market.Close(r.Day).Format(catalog.NaiveLayout)
	out := api.MarketsResponse{Markets: make([]api.Market, 0, len(catalog.Markets()))}
	for _, m := range catalog.Markets() {
		out.Markets = append(out.Markets, api.Market{
			Code:     m.Code,
			Name:     m.Name,
			Timezone: m.Timezone,
			LiveSession: api.LiveSessionInfo{
				Phase:    api.LiveSessionInfoPhase(r.Phase), // follows the session clock
				OpensAt:  opens,
				ClosesAt: closes,
			},
		})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *handler) instruments(w http.ResponseWriter, r *http.Request) {
	code, ok := httpx.RequireQuery(w, r, "market")
	if !ok {
		return
	}
	if _, found := catalog.FindMarket(code); !found {
		httpx.WriteError(w, http.StatusBadRequest, "unknown market: "+code)
		return
	}
	list := catalog.InstrumentsFor(code)
	out := api.InstrumentsResponse{Market: code, Instruments: make([]api.Instrument, 0, len(list))}
	for _, in := range list {
		out.Instruments = append(out.Instruments, in.API())
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

// state: active is null until the account joins or starts a session.
func (h *handler) state(w http.ResponseWriter, r *http.Request) {
	acct, ok := httpx.RequireQuery(w, r, "account_id")
	if !ok {
		return
	}
	var active *api.ActiveSession
	if s, in := h.sessions.Get(acct); in {
		s = h.withLivePhase(s)
		active = &s
	}
	httpx.WriteJSON(w, http.StatusOK, api.SessionState{Active: active})
}

// withLivePhase gives a live session the market's CURRENT phase (practice has its own clock
// and stays open). The stored session only records that the account is in one.
func (h *handler) withLivePhase(s api.ActiveSession) api.ActiveSession {
	if s.Type == api.Live {
		r := h.clock.Read()
		closes := market.Close(r.Day).Format(catalog.NaiveLayout)
		s.Phase = api.ActiveSessionPhase(r.Phase)
		s.ClosesAt = &closes
	}
	return s
}

func (h *handler) joinLive(w http.ResponseWriter, r *http.Request) {
	var req api.JoinLiveRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	if req.AccountId == "" || req.Market == "" {
		httpx.WriteError(w, http.StatusBadRequest, "account_id and market are required")
		return
	}
	m, ok := catalog.FindMarket(req.Market)
	if !ok {
		httpx.WriteError(w, http.StatusBadRequest, "unknown market: "+req.Market)
		return
	}
	sess := h.withLivePhase(api.ActiveSession{Type: api.Live, Market: m.Code})
	if !h.sessions.StartIfFree(req.AccountId, sess) {
		httpx.WriteReason(w, http.StatusConflict, "already_in_session")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, sess)
}

func (h *handler) startPractice(w http.ResponseWriter, r *http.Request) {
	var req api.StartPracticeRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	if req.AccountId == "" || req.Market == "" {
		httpx.WriteError(w, http.StatusBadRequest, "account_id and market are required")
		return
	}
	m, ok := catalog.FindMarket(req.Market)
	if !ok {
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
	ends := time.Now().In(m.Location()).Add(time.Duration(req.LengthMinutes) * time.Minute).Format(catalog.NaiveLayout)
	cond := req.Condition
	sess := api.ActiveSession{
		Type:      api.Practice,
		Market:    m.Code,
		Phase:     api.ActiveSessionPhaseOpen,
		ClosesAt:  &ends,
		Condition: &cond,
	}
	if !h.sessions.StartIfFree(req.AccountId, sess) {
		httpx.WriteReason(w, http.StatusConflict, "already_in_session")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, h.withLivePhase(sess))
}

func (h *handler) exit(w http.ResponseWriter, r *http.Request) {
	var req api.ExitSessionRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	if req.AccountId == "" {
		httpx.WriteError(w, http.StatusBadRequest, "account_id is required")
		return
	}
	h.sessions.Clear(req.AccountId) // idempotent: exiting with no session is still ok
	ok := true
	httpx.WriteJSON(w, http.StatusOK, api.ExitSessionResponse{Ok: &ok})
}
