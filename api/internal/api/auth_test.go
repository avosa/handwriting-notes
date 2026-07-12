package api

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/avosa/handwriting-notes/api/internal/config"
	"github.com/avosa/handwriting-notes/api/internal/store"
)

func testServer() http.Handler {
	s := New(config.Config{Env: "development"}, store.NewMemory(), []byte("test-secret"), slog.New(slog.NewTextHandler(io.Discard, nil)))
	return s.Handler()
}

func do(t *testing.T, h http.Handler, method, path, bearer string, body any) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	if rec.Body.Len() > 0 {
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
	}
	return rec, out
}

func signup(t *testing.T, h http.Handler, email, pw string) (access, refresh string) {
	t.Helper()
	rec, out := do(t, h, http.MethodPost, "/api/auth/signup", "", map[string]string{"email": email, "password": pw})
	if rec.Code != http.StatusOK {
		t.Fatalf("signup: status %d body %v", rec.Code, out)
	}
	return out["access"].(string), out["refresh"].(string)
}

func TestSignupLoginMe(t *testing.T) {
	h := testServer()
	access, _ := signup(t, h, "a@b.com", "password123")

	rec, out := do(t, h, http.MethodGet, "/api/auth/me", access, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("me: status %d", rec.Code)
	}
	user, _ := out["email"].(string)
	if user != "a@b.com" {
		t.Fatalf("me email = %q", user)
	}

	// Login with the same credentials returns a working session too.
	rec, out = do(t, h, http.MethodPost, "/api/auth/login", "", map[string]string{"email": "a@b.com", "password": "password123"})
	if rec.Code != http.StatusOK || out["access"] == nil {
		t.Fatalf("login: status %d body %v", rec.Code, out)
	}
}

func TestSignupRejects(t *testing.T) {
	h := testServer()
	// short password
	if rec, _ := do(t, h, http.MethodPost, "/api/auth/signup", "", map[string]string{"email": "a@b.com", "password": "short"}); rec.Code != http.StatusBadRequest {
		t.Fatalf("short password: status %d", rec.Code)
	}
	// bad email
	if rec, _ := do(t, h, http.MethodPost, "/api/auth/signup", "", map[string]string{"email": "nope", "password": "password123"}); rec.Code != http.StatusBadRequest {
		t.Fatalf("bad email: status %d", rec.Code)
	}
	// duplicate
	signup(t, h, "dup@b.com", "password123")
	if rec, _ := do(t, h, http.MethodPost, "/api/auth/signup", "", map[string]string{"email": "dup@b.com", "password": "password123"}); rec.Code != http.StatusConflict {
		t.Fatalf("duplicate: status %d", rec.Code)
	}
}

func TestLoginWrongPassword(t *testing.T) {
	h := testServer()
	signup(t, h, "a@b.com", "password123")
	if rec, _ := do(t, h, http.MethodPost, "/api/auth/login", "", map[string]string{"email": "a@b.com", "password": "wrong"}); rec.Code != http.StatusUnauthorized {
		t.Fatalf("wrong password: status %d", rec.Code)
	}
	if rec, _ := do(t, h, http.MethodPost, "/api/auth/login", "", map[string]string{"email": "missing@b.com", "password": "password123"}); rec.Code != http.StatusUnauthorized {
		t.Fatalf("missing account: status %d", rec.Code)
	}
}

func TestMeRequiresValidToken(t *testing.T) {
	h := testServer()
	if rec, _ := do(t, h, http.MethodGet, "/api/auth/me", "", nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("no token: status %d", rec.Code)
	}
	if rec, _ := do(t, h, http.MethodGet, "/api/auth/me", "garbage", nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("garbage token: status %d", rec.Code)
	}
}

func TestRefreshRotation(t *testing.T) {
	h := testServer()
	_, refresh := signup(t, h, "a@b.com", "password123")

	// First refresh works and returns a new pair.
	rec, out := do(t, h, http.MethodPost, "/api/auth/refresh", "", map[string]string{"refresh": refresh})
	if rec.Code != http.StatusOK {
		t.Fatalf("refresh: status %d body %v", rec.Code, out)
	}
	newRefresh := out["refresh"].(string)
	if newRefresh == refresh {
		t.Fatal("refresh should be rotated to a new token")
	}

	// The old refresh token is now revoked and must be refused (replay protection).
	if rec, _ := do(t, h, http.MethodPost, "/api/auth/refresh", "", map[string]string{"refresh": refresh}); rec.Code != http.StatusUnauthorized {
		t.Fatalf("replay of old refresh: status %d, want 401", rec.Code)
	}
	// The new one still works.
	if rec, _ := do(t, h, http.MethodPost, "/api/auth/refresh", "", map[string]string{"refresh": newRefresh}); rec.Code != http.StatusOK {
		t.Fatalf("new refresh: status %d", rec.Code)
	}
}

func TestLogoutRevokesRefresh(t *testing.T) {
	h := testServer()
	_, refresh := signup(t, h, "a@b.com", "password123")
	if rec, _ := do(t, h, http.MethodPost, "/api/auth/logout", "", map[string]string{"refresh": refresh}); rec.Code != http.StatusOK {
		t.Fatalf("logout: status %d", rec.Code)
	}
	if rec, _ := do(t, h, http.MethodPost, "/api/auth/refresh", "", map[string]string{"refresh": refresh}); rec.Code != http.StatusUnauthorized {
		t.Fatalf("refresh after logout: status %d, want 401", rec.Code)
	}
}

func TestDeleteAccount(t *testing.T) {
	h := testServer()
	access, _ := signup(t, h, "a@b.com", "password123")
	if rec, _ := do(t, h, http.MethodDelete, "/api/auth/account", access, nil); rec.Code != http.StatusOK {
		t.Fatalf("delete: status %d", rec.Code)
	}
	// The access token no longer resolves to an account.
	if rec, _ := do(t, h, http.MethodGet, "/api/auth/me", access, nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("me after delete: status %d, want 401", rec.Code)
	}
}
