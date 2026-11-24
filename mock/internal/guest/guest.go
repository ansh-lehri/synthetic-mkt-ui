// Package guest implements the in-memory mock for the guest free-session quota
// endpoints: GET /api/guest/quota and POST /api/guest/consume.
package guest

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"

	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/httpx"
)

// FreeSessionLimit is the number of free practice sessions each guest identity
// may consume before being asked to register.
const FreeSessionLimit = 3

// Store is a thread-safe in-memory quota store.
type Store struct {
	mu   sync.Mutex
	used map[string]int
}

// NewStore returns an empty Store.
func NewStore() *Store {
	return &Store{used: make(map[string]int)}
}

// quotaResponse is the shared body for quota and consume endpoints.
type quotaResponse struct {
	Used      int `json:"used"`
	Limit     int `json:"limit"`
	Remaining int `json:"remaining"`
}

func (s *Store) quota(guestID string) quotaResponse {
	used := s.used[guestID]
	remaining := FreeSessionLimit - used
	if remaining < 0 {
		remaining = 0
	}
	return quotaResponse{Used: used, Limit: FreeSessionLimit, Remaining: remaining}
}

// HandleQuota is the GET /api/guest/quota handler.
// Query: guest_id=<id>
func (s *Store) HandleQuota(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	guestID := strings.TrimSpace(r.URL.Query().Get("guest_id"))
	if guestID == "" {
		httpx.WriteError(w, http.StatusBadRequest, "missing required query parameter: guest_id")
		return
	}
	if !isValidGuestID(guestID) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid guest_id format")
		return
	}

	s.mu.Lock()
	q := s.quota(guestID)
	s.mu.Unlock()

	httpx.WriteJSON(w, http.StatusOK, q)
}

type consumeRequest struct {
	GuestID string `json:"guest_id"`
}

// HandleConsume is the POST /api/guest/consume handler. Atomically increments
// used for the guest identity if the limit has not been reached; returns 409 if
// the limit is already at its maximum.
func (s *Store) HandleConsume(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var body consumeRequest
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	body.GuestID = strings.TrimSpace(body.GuestID)
	if body.GuestID == "" {
		httpx.WriteError(w, http.StatusBadRequest, "guest_id is required")
		return
	}
	if !isValidGuestID(body.GuestID) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid guest_id format")
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.used[body.GuestID] >= FreeSessionLimit {
		httpx.WriteError(w, http.StatusConflict, "free_session_limit_reached")
		return
	}

	s.used[body.GuestID]++
	q := s.quota(body.GuestID)

	httpx.WriteJSON(w, http.StatusOK, q)
}

// Quota returns the current quota for a guest identity without mutating state.
// Safe for concurrent use.
func (s *Store) Quota(guestID string) quotaResponse {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.quota(guestID)
}

// isValidGuestID checks that the ID starts with "guest_" and is non-trivially long.
func isValidGuestID(guestID string) bool {
	return strings.HasPrefix(guestID, "guest_") && len(guestID) > 6
}
