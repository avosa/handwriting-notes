package api

import (
	"encoding/base64"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/avosa/handwriting-notes/api/internal/config"
	"github.com/avosa/handwriting-notes/api/internal/store"
)

func TestExportBundlesEverything(t *testing.T) {
	h := testServer()
	access, _ := signup(t, h, "a@b.com", "password123")
	// A note and an attachment.
	do(t, h, http.MethodPut, "/api/sync/notes/n1", access, map[string]any{"ciphertext": b64("note-cipher"), "baseRev": 0})
	putBytes(t, h, grantURL(t, h, access, "att1", "put"), []byte("blob-cipher"))

	rec, out := do(t, h, http.MethodGet, "/api/account/export", access, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("export: status %d", rec.Code)
	}
	notes := out["notes"].([]any)
	blobs := out["blobs"].([]any)
	if len(notes) != 1 || len(blobs) != 1 {
		t.Fatalf("export sizes: %d notes, %d blobs", len(notes), len(blobs))
	}
	if notes[0].(map[string]any)["ciphertext"] != b64("note-cipher") {
		t.Fatal("note ciphertext not in export")
	}
	if blobs[0].(map[string]any)["ciphertext"] != base64.StdEncoding.EncodeToString([]byte("blob-cipher")) {
		t.Fatal("blob ciphertext not in export")
	}
}

func TestDeleteAccountCascades(t *testing.T) {
	h := testServer()
	access, _ := signup(t, h, "a@b.com", "password123")
	do(t, h, http.MethodPut, "/api/sync/notes/n1", access, map[string]any{"ciphertext": b64("x"), "baseRev": 0})
	if rec, _ := do(t, h, http.MethodDelete, "/api/auth/account", access, nil); rec.Code != http.StatusOK {
		t.Fatalf("delete account: status %d", rec.Code)
	}
	// The account and its data are gone: the token no longer resolves.
	if rec, _ := do(t, h, http.MethodGet, "/api/auth/me", access, nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("me after delete: status %d, want 401", rec.Code)
	}
}

func TestRateLimit(t *testing.T) {
	// A strict limiter: a burst of 3, refilling slowly, so the fourth immediate request is throttled.
	s := New(config.Config{Env: "development", RatePerSec: 0.001, RateBurst: 3}, store.NewMemory(), []byte("secret"), slog.New(slog.NewTextHandler(io.Discard, nil)))
	h := s.Handler()

	statuses := make([]int, 0, 4)
	for i := 0; i < 4; i++ {
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		req.RemoteAddr = "10.0.0.1:1234"
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		statuses = append(statuses, rec.Code)
	}
	// First three within the burst, the fourth throttled.
	for i := 0; i < 3; i++ {
		if statuses[i] != http.StatusOK {
			t.Fatalf("request %d: status %d, want 200", i, statuses[i])
		}
	}
	if statuses[3] != http.StatusTooManyRequests {
		t.Fatalf("request 4: status %d, want 429", statuses[3])
	}
}

func TestRateLimitPerClient(t *testing.T) {
	s := New(config.Config{Env: "development", RatePerSec: 0.001, RateBurst: 1}, store.NewMemory(), []byte("secret"), slog.New(slog.NewTextHandler(io.Discard, nil)))
	h := s.Handler()
	call := func(ip string) int {
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		req.RemoteAddr = ip + ":1"
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}
	if call("1.1.1.1") != http.StatusOK || call("1.1.1.1") != http.StatusTooManyRequests {
		t.Fatal("first client should be limited after its single token")
	}
	// A different client has its own bucket and is not affected.
	if call("2.2.2.2") != http.StatusOK {
		t.Fatal("second client should not be throttled by the first")
	}
}
