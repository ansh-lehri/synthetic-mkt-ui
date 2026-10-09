// Package httpx holds the small HTTP helpers shared by the mock's route packages:
// JSON responses, the two error envelopes, method guarding, and CORS.
package httpx

import (
	"encoding/json"
	"net/http"
	"strings"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
)

// WriteJSON writes v as a JSON body with the given status.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// WriteError writes the generic error envelope: {"error":"<human message>"}.
func WriteError(w http.ResponseWriter, status int, msg string) {
	WriteJSON(w, status, api.ErrorBody{Error: msg})
}

// WriteReason writes the business-reject envelope: {"reason":"<snake_case>"}.
func WriteReason(w http.ResponseWriter, status int, reason string) {
	WriteJSON(w, status, api.ReasonEnvelope{Reason: reason})
}

// Method guards a handler to a single HTTP method; anything else gets a 405 error envelope.
func Method(method string, h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != method {
			w.Header().Set("Allow", method)
			WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		h(w, r)
	}
}

// DecodeJSON reads a JSON request body into v, rejecting unknown fields. On failure it
// writes a 400 error envelope and returns false.
func DecodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return false
	}
	return true
}

// RequireQuery returns the non-empty value of a query parameter, or writes a 400 error
// envelope and returns false.
func RequireQuery(w http.ResponseWriter, r *http.Request, name string) (string, bool) {
	v := strings.TrimSpace(r.URL.Query().Get(name))
	if v == "" {
		WriteError(w, http.StatusBadRequest, "missing required query parameter: "+name)
		return "", false
	}
	return v, true
}

// CORS opens the mock to any origin for local development (the Vite dev server is on a
// different port). Never use this on the real backend.
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", "*")
		h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		h.Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
