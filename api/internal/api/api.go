// Package api wires the HTTP surface of the service: the router, the middleware every request passes
// through, and the handlers. It depends only on the store interface and the auth primitives, so the
// transport layer never reaches for a database or a crypto detail directly.
package api

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/avosa/handwriting-notes/api/internal/auth"
	"github.com/avosa/handwriting-notes/api/internal/config"
	"github.com/avosa/handwriting-notes/api/internal/store"
)

// Server holds what the handlers need: the settings, the store, the token signer, and a logger.
type Server struct {
	cfg    config.Config
	store  store.Store
	signer *auth.Signer
	log    *slog.Logger
}

// New builds a Server ready to serve, signing tokens with the given secret.
func New(cfg config.Config, st store.Store, secret []byte, log *slog.Logger) *Server {
	return &Server{cfg: cfg, store: st, signer: auth.NewSigner(secret), log: log}
}

// Handler returns the root HTTP handler with every route and the middleware chain applied. The
// standard library's method-and-path routing is enough — no framework — which keeps the binary and
// the request path lean. Authentication is applied per route with requireUser, so a public endpoint
// never pays for it and a protected one can never forget it.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /api/health", s.handleHealth)

	mux.HandleFunc("POST /api/auth/signup", s.handleSignup)
	mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	mux.HandleFunc("POST /api/auth/refresh", s.handleRefresh)
	mux.HandleFunc("POST /api/auth/logout", s.handleLogout)
	mux.Handle("GET /api/auth/me", s.requireUser(http.HandlerFunc(s.handleMe)))
	mux.Handle("DELETE /api/auth/account", s.requireUser(http.HandlerFunc(s.handleDeleteAccount)))

	return withRecovery(s.log, withRequestLog(s.log, mux))
}

// writeJSON sends a value as JSON with a status code — the single place responses are encoded, so
// every handler answers the same way.
func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// writeError sends a plain JSON error with a status code.
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// decodeJSON reads a JSON request body into v, bounding its size so a huge body cannot exhaust memory.
func decodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return false
	}
	return true
}
