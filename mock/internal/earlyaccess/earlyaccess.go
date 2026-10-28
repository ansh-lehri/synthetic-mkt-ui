// Package earlyaccess implements the in-memory mock for the
// POST /api/early-access/register landing endpoint.
package earlyaccess

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"

	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/httpx"
)

// Row holds one registration entry, keyed by lower-cased email.
type Row struct {
	Email      string
	Experience string
	Market     string
	Source     string
}

// Store is a thread-safe in-memory registration store.
type Store struct {
	mu   sync.Mutex
	rows map[string]Row
}

// NewStore returns an empty Store.
func NewStore() *Store {
	return &Store{rows: make(map[string]Row)}
}

type registerRequest struct {
	Email      string  `json:"email"`
	Experience string  `json:"experience"`
	Market     *string `json:"market"`
	Source     string  `json:"source"`
}

type registerResponse struct {
	OK bool `json:"ok"`
}

// HandleRegister is the POST /api/early-access/register handler.
func (s *Store) HandleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var body registerRequest
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	if !strings.Contains(body.Email, "@") || strings.TrimSpace(body.Email) == "" {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_email")
		return
	}

	switch body.Experience {
	case "new", "some", "active":
		// valid
	default:
		httpx.WriteError(w, http.StatusBadRequest, "missing_experience")
		return
	}

	var market string
	if body.Market != nil {
		switch *body.Market {
		case "india", "us":
			market = *body.Market
		}
	}

	key := strings.ToLower(strings.TrimSpace(body.Email))
	s.mu.Lock()
	s.rows[key] = Row{
		Email:      key,
		Experience: body.Experience,
		Market:     market,
		Source:     body.Source,
	}
	s.mu.Unlock()

	httpx.WriteJSON(w, http.StatusCreated, registerResponse{OK: true})
}

// Lookup returns the stored Row for an email (case-insensitive). The
// second return is false when the email has not been registered.
func (s *Store) Lookup(email string) (Row, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	row, ok := s.rows[strings.ToLower(strings.TrimSpace(email))]
	return row, ok
}
