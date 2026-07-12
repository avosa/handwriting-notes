package api

import (
	"context"
	"net/http"
	"time"
)

// healthResponse is what /health answers with: whether the service and its store are up.
type healthResponse struct {
	Status string `json:"status"`
	Store  string `json:"store"`
}

// handleHealth reports liveness for load balancers and uptime checks. It also pings the store, so a
// green health means the service can reach its database, not merely that the process is running.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	if err := s.store.Ping(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, healthResponse{Status: "degraded", Store: "unreachable"})
		return
	}
	writeJSON(w, http.StatusOK, healthResponse{Status: "ok", Store: "ok"})
}
