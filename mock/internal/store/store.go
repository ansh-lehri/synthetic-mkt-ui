// Package store holds the mock's only mutable state: which session each account is in.
// It backs the one-session gate and the "no session" 409s on live account reads and orders.
package store

import (
	"sync"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
)

// Sessions maps account_id -> its active session. Safe for concurrent use.
type Sessions struct {
	mu   sync.RWMutex
	m    map[string]api.ActiveSession
	seq  map[string]int64 // account -> id of its current session (changes with every new session)
	next int64
}

// NewSessions returns an empty store (every account starts in no session).
func NewSessions() *Sessions {
	return &Sessions{m: map[string]api.ActiveSession{}, seq: map[string]int64{}}
}

// Seq identifies the account's current session; a new session always gets a new value, so
// per-session state (a practice ledger) can tell "the same session" from "a fresh one".
func (s *Sessions) Seq(accountID string) (int64, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.seq[accountID]
	return v, ok
}

// Get returns the account's active session, if any.
func (s *Sessions) Get(accountID string) (api.ActiveSession, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.m[accountID]
	return v, ok
}

// Active reports whether the account is in a session.
func (s *Sessions) Active(accountID string) bool {
	_, ok := s.Get(accountID)
	return ok
}

// StartIfFree records a session unless the account is already in one. It reports whether
// the session was started (false = the one-session gate refused it).
func (s *Sessions) StartIfFree(accountID string, sess api.ActiveSession) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, busy := s.m[accountID]; busy {
		return false
	}
	s.m[accountID] = sess
	s.next++
	s.seq[accountID] = s.next
	return true
}

// Clear ends the account's session (a no-op when there is none).
func (s *Sessions) Clear(accountID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.m, accountID)
	delete(s.seq, accountID)
}
