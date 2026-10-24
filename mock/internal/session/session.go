// Package session serves the catalog + session-lifecycle surface: GET /v1/markets,
// GET /v1/instruments, POST /session/canonical, POST /session/ondemand,
// GET /session/status, POST /session/current, POST /session/exit.
//
// Rewritten for Phase 2 of BACKEND-INTEGRATION-PLAN.md to match the real backend's
// two-session-kind model (store.Sessions) instead of the old single-session-shape
// store. POST /v1/account/open lives in internal/identity, not here — it needs no
// session/catalog state.
package session

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/catalog"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/httpx"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/market"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/store"
)

// MinOnDemandBalance mirrors the real backend's money-floor gate on /session/ondemand
// (QualifyOnDemand): at or below this, the call still returns 200, just with the
// insufficient_funds body instead of warming_up — never a 409.
const MinOnDemandBalance int64 = 100_000 // 1,000.00 units

// WarmupDelay is how long an on-demand session reports "starting"/"warming_up" before
// flipping to active/ready. Lazy time, like the broker ledger: nothing runs in the
// background: every read computes the current state from `now`.
const WarmupDelay = 2 * time.Second

// DefaultOnDemandDuration is used when the ?duration= query param is absent, matching
// the real backend's default.
const DefaultOnDemandDuration = 60 * time.Minute

type handler struct {
	sessions  *store.Sessions
	clock     *market.Clock
	available func(accountID string) int64
}

// Register mounts the catalog + session-lifecycle routes on mux.
func Register(mux *http.ServeMux, sessions *store.Sessions, clock *market.Clock, available func(accountID string) int64) {
	h := &handler{sessions: sessions, clock: clock, available: available}
	mux.HandleFunc("/v1/markets", httpx.Method(http.MethodGet, h.markets))
	mux.HandleFunc("/v1/instruments", httpx.Method(http.MethodGet, h.instruments))
	mux.HandleFunc("/session/canonical", httpx.Method(http.MethodPost, h.canonical))
	mux.HandleFunc("/session/ondemand", httpx.Method(http.MethodPost, h.ondemand))
	mux.HandleFunc("/session/status", httpx.Method(http.MethodGet, h.status))
	mux.HandleFunc("/session/current", httpx.Method(http.MethodPost, h.current))
	mux.HandleFunc("/session/exit", httpx.Method(http.MethodPost, h.exit))
}

// markets: tag/active/session.{opens_at,closes_at,duration,wall_clock}, matching the
// real backend's shape — no name, no phase (confirmed real-backend gaps/removals).
func (h *handler) markets(w http.ResponseWriter, _ *http.Request) {
	r := h.clock.Read()
	out := api.MarketsResponse{Markets: make([]api.Market, 0, len(catalog.Markets()))}
	for _, m := range catalog.Markets() {
		loc := m.Location()
		opens := market.RealUTC(loc, market.Open(r.Day))
		closes := market.RealUTC(loc, market.Close(r.Day))
		out.Markets = append(out.Markets, api.Market{
			Tag:    m.Code,
			Active: true, // the mock's one canonical market is always "Live"
			Session: api.MarketSession{
				OpensAt:   opens,
				ClosesAt:  closes,
				Duration:  closes.Sub(opens).String(),
				WallClock: fmt.Sprintf("%02d:%02d–%02d:%02d %s", m.OpenH, m.OpenM, m.CloseH, m.CloseM, opens.In(loc).Format("MST")),
			},
		})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

// instruments: {id, tick_size} only, matching the real backend's shape exactly
// (catalog.Instrument.API() deliberately omits name/lot_size/price_decimals).
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

func (h *handler) canonical(w http.ResponseWriter, r *http.Request) {
	var req api.JoinCanonicalRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	if req.User.UserId == "" || req.Market == "" {
		httpx.WriteError(w, http.StatusBadRequest, "user.user_id and market are required")
		return
	}
	if _, ok := catalog.FindMarket(req.Market); !ok {
		httpx.WriteError(w, http.StatusBadRequest, "unknown market: "+req.Market)
		return
	}
	sess, conflict := h.sessions.JoinCanonical(req.User.UserId, req.Market)
	if conflict {
		httpx.WriteError(w, http.StatusConflict, "already live on another session")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, api.JoinCanonicalResponse{
		SessionId: sess.SessionID, ParticipantId: sess.ParticipantID, Status: api.JoinCanonicalResponseStatusActive,
	})
}

// ondemand is a HELD request on the real backend (synchronous setup pipeline); the
// mock has no pipeline to run, so it returns immediately with the same body shapes.
// req.Condition (the scenario picker) is accepted on the wire but deliberately not
// read — it's a documented no-op ahead of backend support (BACKEND-INTEGRATION-PLAN.md
// §4/§6); the mock has no scenario-driven market behavior to switch on either.
func (h *handler) ondemand(w http.ResponseWriter, r *http.Request) {
	var req api.OnDemandRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	if req.User.UserId == "" {
		httpx.WriteError(w, http.StatusBadRequest, "user.user_id is required")
		return
	}
	mkt := r.URL.Query().Get("market")
	if mkt == "" {
		httpx.WriteError(w, http.StatusBadRequest, "market is required")
		return
	}
	if _, ok := catalog.FindMarket(mkt); !ok {
		httpx.WriteError(w, http.StatusBadRequest, "unknown market: "+mkt)
		return
	}
	duration := DefaultOnDemandDuration
	if raw := r.URL.Query().Get("duration"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 5 || n > 120 {
			httpx.WriteError(w, http.StatusBadRequest, "duration must be an integer minutes in [5,120]")
			return
		}
		duration = time.Duration(n) * time.Minute
	}
	if h.available != nil && h.available(req.User.UserId) <= MinOnDemandBalance {
		httpx.WriteJSON(w, http.StatusOK, api.OnDemandInsufficientFundsBody{
			Status:  api.InsufficientFunds,
			Message: "insufficient funds for on-demand session; move money and retry",
		})
		return
	}
	sess, conflict := h.sessions.StartOnDemand(req.User.UserId, mkt, WarmupDelay, duration)
	if conflict {
		httpx.WriteError(w, http.StatusConflict, "already in a session")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, api.OnDemandWarmingUpBody{
		Status:        api.WarmingUp,
		SessionId:     sess.SessionID,
		WarmupEndsAt:  sess.WarmupEndsAt.UTC().Format(time.RFC3339Nano),
		SessionEndsAt: sess.SessionEndsAt.UTC().Format(time.RFC3339Nano),
	})
}

func (h *handler) status(w http.ResponseWriter, r *http.Request) {
	sid, ok := httpx.RequireQuery(w, r, "session")
	if !ok {
		return
	}
	sess, found := h.sessions.GetBySession(sid)
	if !found {
		httpx.WriteError(w, http.StatusNotFound, "unknown session")
		return
	}
	body := api.SessionStatusBody{Status: api.SessionStatusBodyStatus(h.sessions.Label(sess))}
	if sess.Mode == store.Ondemand {
		warm := sess.WarmupEndsAt.UTC().Format(time.RFC3339Nano)
		end := sess.SessionEndsAt.UTC().Format(time.RFC3339Nano)
		body.WarmupEndsAt, body.SessionEndsAt = &warm, &end
	}
	httpx.WriteJSON(w, http.StatusOK, body)
}

func (h *handler) current(w http.ResponseWriter, r *http.Request) {
	var req api.SessionCurrentRequest
	if !httpx.DecodeJSON(w, r, &req) {
		return
	}
	if req.User.UserId == "" {
		httpx.WriteError(w, http.StatusBadRequest, "user.user_id is required")
		return
	}
	sess, found := h.sessions.Get(req.User.UserId)
	if !found {
		httpx.WriteError(w, http.StatusNotFound, "no session for user")
		return
	}
	resp := api.SessionCurrentResponse{
		SessionId: sess.SessionID,
		Mode:      api.SessionCurrentResponseMode(sess.Mode),
		Market:    sess.Market,
		Status:    api.SessionCurrentResponseStatus(h.sessions.RawStatus(sess)),
	}
	if sess.Mode == store.Ondemand {
		warm := sess.WarmupEndsAt.UTC().Format(time.RFC3339Nano)
		end := sess.SessionEndsAt.UTC().Format(time.RFC3339Nano)
		resp.WarmupEndsAt, resp.SessionEndsAt = &warm, &end
	}
	httpx.WriteJSON(w, http.StatusOK, resp)
}

// exit: a not-found session_id is a 404 for EITHER mode in this mock. On-demand's
// 404-on-already-reaped is a real, intentional contract behavior; canonical's rarer
// idempotent-200-on-already-gone case is a broker/registry-desync race the mock's
// single-map model has no way to reach — see PHASE-2-MOCK-REWRITE-PLAN.md Stage 2.4.
func (h *handler) exit(w http.ResponseWriter, r *http.Request) {
	sid, ok := httpx.RequireQuery(w, r, "session")
	if !ok {
		return
	}
	if !h.sessions.ExitBySession(sid) {
		httpx.WriteError(w, http.StatusNotFound, "conductor: session not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, api.SessionExitResponse{Status: api.Ended})
}
