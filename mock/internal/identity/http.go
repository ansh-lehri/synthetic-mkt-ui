package identity

import (
	"net/http"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/httpx"
)

// Register mounts POST /v1/account/open on mux.
func Register(mux *http.ServeMux, identities *Identities) {
	mux.HandleFunc("/v1/account/open", httpx.Method(http.MethodPost, func(w http.ResponseWriter, r *http.Request) {
		var req api.AccountOpenRequest
		if !httpx.DecodeJSON(w, r, &req) {
			return
		}
		if req.User.UserId == "" {
			httpx.WriteError(w, http.StatusBadRequest, "user_id required")
			return
		}
		httpx.WriteJSON(w, http.StatusOK, api.AccountOpenResponse{AccountId: identities.Open(req.User.UserId)})
	}))
}
