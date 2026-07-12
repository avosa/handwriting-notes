package api

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/avosa/handwriting-notes/api/internal/config"
	"github.com/avosa/handwriting-notes/api/internal/store"
)

func newTestServer() *Server {
	return New(config.Config{Env: "development"}, store.NewMemory(), slog.New(slog.NewTextHandler(io.Discard, nil)))
}

func TestHealthOK(t *testing.T) {
	srv := newTestServer()
	for _, path := range []string{"/health", "/api/health"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("%s: got status %d, want 200", path, rec.Code)
		}
		var body healthResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("%s: decode: %v", path, err)
		}
		if body.Status != "ok" || body.Store != "ok" {
			t.Fatalf("%s: got %+v, want ok/ok", path, body)
		}
	}
}

func TestUnknownRouteIs404(t *testing.T) {
	srv := newTestServer()
	req := httptest.NewRequest(http.MethodGet, "/nope", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("got status %d, want 404", rec.Code)
	}
}
