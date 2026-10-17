// Package identity serves the real backend's signup/login handshake: POST
// /v1/account/open. Mock simplification (documented, not hidden): the mock's
// account_id IS the user_id, verbatim. This is still genuinely idempotent — the same
// user_id always yields the same account_id — which is the only behavior the contract
// requires; the mock has no reason to invent a second id space. Kept as its own small
// package (not just a helper function) so a future need to diverge the two id spaces
// has a natural seam to grow into.
package identity

import "sync"

// Identities tracks which user_id values have called POST /v1/account/open at least
// once — this backs GET /v1/account/cash's 404-on-unknown-account behavior, the one
// broker/reads endpoint that distinguishes "never opened" from "opened, zero activity".
type Identities struct {
	mu    sync.RWMutex
	known map[string]bool
}

// NewIdentities returns an empty registry (no account has been opened yet).
func NewIdentities() *Identities {
	return &Identities{known: map[string]bool{}}
}

// Open is idempotent: the account_id returned is always exactly the user_id given.
func (i *Identities) Open(userID string) (accountID string) {
	i.mu.Lock()
	i.known[userID] = true
	i.mu.Unlock()
	return userID
}

// Known reports whether this account_id was ever opened.
func (i *Identities) Known(accountID string) bool {
	i.mu.RLock()
	defer i.mu.RUnlock()
	return i.known[accountID]
}
