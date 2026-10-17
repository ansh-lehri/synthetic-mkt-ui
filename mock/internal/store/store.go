// Package store holds the mock's session registry: the real backend's two session
// kinds (canonical / on-demand), looked up by account_id (join/current) and by
// session_id (status/exit/ws) — replacing the single-session-shape store from before
// the Phase 1/2 backend-integration rewrite (see BACKEND-INTEGRATION-PLAN.md).
package store

import (
	"fmt"
	"sync"
	"time"
)

// Mode distinguishes the real backend's two session kinds.
type Mode string

const (
	Canonical Mode = "canonical"
	Ondemand  Mode = "ondemand"
)

// Session is one account's live session record. WarmupEndsAt/SessionEndsAt are zero
// for canonical sessions, which never carry an end timer on the real backend — only
// on-demand sessions do.
type Session struct {
	SessionID     string
	ParticipantID string
	AccountID     string
	Market        string
	Mode          Mode
	StartedAt     time.Time
	WarmupEndsAt  time.Time
	SessionEndsAt time.Time
}

func (s Session) isOndemand() bool { return s.Mode == Ondemand }

// Sessions is the mock's session registry: one session per account (the one-session
// gate), safe for concurrent use. `now` is injected so tests can drive on-demand
// warm-up/expiry deterministically, the same lazy-time discipline as the broker ledger.
type Sessions struct {
	now func() time.Time

	mu        sync.Mutex
	byAccount map[string]*Session
	bySession map[string]*Session
	seq       map[string]int64 // account -> current session's sequence (practice-ledger reuse key)
	next      int64
}

// NewSessions returns an empty registry (every account starts in no session).
func NewSessions(now func() time.Time) *Sessions {
	return &Sessions{now: now, byAccount: map[string]*Session{}, bySession: map[string]*Session{}, seq: map[string]int64{}}
}

// reap drops any on-demand session whose SessionEndsAt has passed — a lazy stand-in for
// the real backend's automatic reaper. Callers must hold mu.
func (s *Sessions) reap() {
	now := s.now()
	for acct, sess := range s.byAccount {
		if sess.isOndemand() && !sess.SessionEndsAt.IsZero() && !now.Before(sess.SessionEndsAt) {
			delete(s.byAccount, acct)
			delete(s.bySession, sess.SessionID)
			delete(s.seq, acct)
		}
	}
}

// Get returns the account's current session (resolve-by-identity, as /session/current does).
func (s *Sessions) Get(accountID string) (Session, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.reap()
	sess, ok := s.byAccount[accountID]
	if !ok {
		return Session{}, false
	}
	return *sess, true
}

// GetBySession looks a session up by its session_id (the status/exit/ws carrier).
func (s *Sessions) GetBySession(sessionID string) (Session, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.reap()
	sess, ok := s.bySession[sessionID]
	if !ok {
		return Session{}, false
	}
	return *sess, true
}

// Active reports whether the account currently has a live session of either kind — the
// one gate every account/order read and write checks.
func (s *Sessions) Active(accountID string) bool {
	_, ok := s.Get(accountID)
	return ok
}

// Seq identifies the account's current session (ties a practice-style ledger to one
// session instance so a fresh session gets a fresh copy).
func (s *Sessions) Seq(accountID string) (int64, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.reap()
	v, ok := s.seq[accountID]
	return v, ok
}

func (s *Sessions) nextID(prefix string) string {
	s.next++
	return fmt.Sprintf("%s-%d", prefix, s.next)
}

func (s *Sessions) install(accountID string, sess *Session) {
	s.byAccount[accountID] = sess
	s.bySession[sess.SessionID] = sess
	s.next++
	s.seq[accountID] = s.next
}

// JoinCanonical implements POST /session/canonical's admission rule: a reconnect (same
// account, same market, already in a canonical session) returns the EXISTING session
// verbatim with zero further I/O. Any other existing session is a conflict.
func (s *Sessions) JoinCanonical(accountID, market string) (sess Session, conflict bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.reap()
	if existing, in := s.byAccount[accountID]; in {
		if existing.Mode == Canonical && existing.Market == market {
			return *existing, false
		}
		return Session{}, true
	}
	fresh := &Session{
		SessionID: s.nextID("sess"), ParticipantID: s.nextID("part"),
		AccountID: accountID, Market: market, Mode: Canonical, StartedAt: s.now(),
	}
	s.install(accountID, fresh)
	return *fresh, false
}

// StartOnDemand implements POST /session/ondemand's admission rule. Unlike canonical,
// there is no reconnect case here — a second trigger for a busy account is always a
// conflict (ErrAlreadyInSession on the real backend).
func (s *Sessions) StartOnDemand(accountID, market string, warmup, duration time.Duration) (sess Session, conflict bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.reap()
	if _, in := s.byAccount[accountID]; in {
		return Session{}, true
	}
	now := s.now()
	fresh := &Session{
		SessionID: s.nextID("sess"), ParticipantID: s.nextID("part"),
		AccountID: accountID, Market: market, Mode: Ondemand, StartedAt: now,
		WarmupEndsAt: now.Add(warmup), SessionEndsAt: now.Add(warmup + duration),
	}
	s.install(accountID, fresh)
	return *fresh, false
}

// ExitBySession removes a session by its session_id and reports whether one was found.
// Used for BOTH canonical and on-demand exit: a not-found session_id is a 404 for
// either mode in this simplified mock (the real backend's canonical-only idempotent-200
// case is a broker/registry-desync race the mock's single-map model has no way to
// reach — see PHASE-2-MOCK-REWRITE-PLAN.md Stage 2.4).
func (s *Sessions) ExitBySession(sessionID string) (found bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.reap()
	sess, ok := s.bySession[sessionID]
	if !ok {
		return false
	}
	delete(s.byAccount, sess.AccountID)
	delete(s.bySession, sessionID)
	delete(s.seq, sess.AccountID)
	return true
}

// RawStatus is /session/current's status vocabulary (starting/active/stopping/ended/
// failed) for a session. The mock never produces stopping/failed — there is no async
// teardown-in-progress or setup-failure state in this simplified model.
func (s *Sessions) RawStatus(sess Session) string {
	if sess.Mode == Canonical {
		return "active"
	}
	if s.now().Before(sess.WarmupEndsAt) {
		return "starting"
	}
	return "active"
}

// Label is /session/status's UI-facing vocabulary for the same underlying states.
func (s *Sessions) Label(sess Session) string {
	if sess.Mode == Canonical {
		return "ready"
	}
	if s.now().Before(sess.WarmupEndsAt) {
		return "warming_up"
	}
	return "ready"
}
