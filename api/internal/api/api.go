// Package api wires the HTTP surface of the service: the router, the middleware every request passes
// through, and the handlers. It depends only on the store interface, so the transport layer never
// reaches for a database directly.
package api

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/avosa/handwriting-notes/api/internal/config"
	"github.com/avosa/handwriting-notes/api/internal/store"
)

// Server holds what the handlers need. It is small on purpose; dependencies are added as features do.
type Server struct {
	cfg   config.Config
	store store.Store
	log   *slog.Logger
}

// New builds a Server ready to serve.
func New(cfg config.Config, st store.Store, log *slog.Logger) *Server {
	return &Server{cfg: cfg, store: st, log: log}
}

// Handler returns the root HTTP handler with every route and the middleware chain applied. The
// standard library's method-and-path routing is enough — no framework — which keeps the binary and
// the request path lean.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /api/health", s.handleHealth)
	return withRecovery(s.log, withRequestLog(s.log, mux))
}

// writeJSON sends a value as JSON with a status code, the single place responses are encoded so every
// handler answers the same way.
func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
