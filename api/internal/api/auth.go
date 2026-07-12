package api

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/avosa/handwriting-notes/api/internal/auth"
	"github.com/avosa/handwriting-notes/api/internal/store"
)

// ctxKey is a private context key type, so nothing outside this package can set or read the request's
// authenticated user by accident.
type ctxKey int

const userKey ctxKey = 0

// credentials is the body of signup and login.
type credentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// tokenBody is the body of refresh and logout.
type tokenBody struct {
	Refresh string `json:"refresh"`
}

// userView is the account shape returned to the client — never the password hash.
type userView struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	CreatedAt string `json:"createdAt"`
}

// sessionView is what an authentication returns: the two tokens and the account.
type sessionView struct {
	Access       string   `json:"access"`
	Refresh      string   `json:"refresh"`
	AccessExpiry string   `json:"accessExpiry"`
	User         userView `json:"user"`
}

func view(u store.User) userView {
	return userView{ID: u.ID, Email: u.Email, CreatedAt: u.CreatedAt.UTC().Format(time.RFC3339)}
}

// A password floor, so an account is never protected by something trivially short. The rest of
// password strength is the writer's business.
const minPasswordLen = 8

func normalizeEmail(email string) string { return strings.ToLower(strings.TrimSpace(email)) }

func validEmail(email string) bool {
	at := strings.IndexByte(email, '@')
	return at > 0 && at < len(email)-1 && !strings.ContainsAny(email, " \t\n")
}

// issueSession mints a token pair for a user, records the refresh token as trusted, and writes the
// session response.
func (s *Server) issueSession(w http.ResponseWriter, ctx context.Context, u store.User) {
	now := time.Now()
	pair, err := s.signer.Issue(u.ID, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not start a session")
		return
	}
	if err := s.store.TrustRefresh(ctx, u.ID, pair.RefreshID, now.Add(auth.RefreshTTL)); err != nil {
		writeError(w, http.StatusInternalServerError, "could not start a session")
		return
	}
	writeJSON(w, http.StatusOK, sessionView{
		Access:       pair.Access,
		Refresh:      pair.Refresh,
		AccessExpiry: pair.AccessExpiry.UTC().Format(time.RFC3339),
		User:         view(u),
	})
}

func (s *Server) handleSignup(w http.ResponseWriter, r *http.Request) {
	var body credentials
	if !decodeJSON(w, r, &body) {
		return
	}
	email := normalizeEmail(body.Email)
	if !validEmail(email) {
		writeError(w, http.StatusBadRequest, "enter a valid email")
		return
	}
	if len(body.Password) < minPasswordLen {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}
	hash, err := auth.HashPassword(body.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create the account")
		return
	}
	id, err := auth.RandomID(16)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create the account")
		return
	}
	u := store.User{ID: id, Email: email, PasswordHash: hash, CreatedAt: time.Now()}
	if err := s.store.CreateUser(r.Context(), u); err != nil {
		if errors.Is(err, store.ErrConflict) {
			writeError(w, http.StatusConflict, "an account with that email already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not create the account")
		return
	}
	s.issueSession(w, r.Context(), u)
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body credentials
	if !decodeJSON(w, r, &body) {
		return
	}
	u, err := s.store.UserByEmail(r.Context(), normalizeEmail(body.Email))
	// Check a password either way so a missing account and a wrong password take the same time and a
	// probe cannot tell which emails are registered.
	if err != nil || !auth.VerifyPassword(body.Password, u.PasswordHash) {
		writeError(w, http.StatusUnauthorized, "wrong email or password")
		return
	}
	s.issueSession(w, r.Context(), u)
}

func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	var body tokenBody
	if !decodeJSON(w, r, &body) {
		return
	}
	claims, err := s.signer.Verify(body.Refresh, time.Now())
	if err != nil || claims.Type != auth.RefreshToken {
		writeError(w, http.StatusUnauthorized, "invalid refresh token")
		return
	}
	// The token must still be trusted; a rotated or revoked one is refused even though it is well
	// formed and unexpired, which is what makes a stolen refresh token detectable.
	trusted, err := s.store.RefreshTrusted(r.Context(), claims.Subject, claims.ID)
	if err != nil || !trusted {
		writeError(w, http.StatusUnauthorized, "invalid refresh token")
		return
	}
	u, err := s.store.UserByID(r.Context(), claims.Subject)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid refresh token")
		return
	}
	now := time.Now()
	pair, err := s.signer.Issue(u.ID, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not refresh the session")
		return
	}
	// Rotate: the old refresh id is revoked and the new one trusted in one step, so each refresh
	// token is used exactly once.
	if err := s.store.RotateRefresh(r.Context(), u.ID, claims.ID, pair.RefreshID, now.Add(auth.RefreshTTL)); err != nil {
		writeError(w, http.StatusInternalServerError, "could not refresh the session")
		return
	}
	writeJSON(w, http.StatusOK, sessionView{
		Access:       pair.Access,
		Refresh:      pair.Refresh,
		AccessExpiry: pair.AccessExpiry.UTC().Format(time.RFC3339),
		User:         view(u),
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	var body tokenBody
	if !decodeJSON(w, r, &body) {
		return
	}
	// A logout is best-effort: a malformed or already-invalid token still returns success, since the
	// goal — that this refresh token no longer works — is met either way. A valid one is revoked.
	if claims, err := s.signer.Verify(body.Refresh, time.Now()); err == nil && claims.Type == auth.RefreshToken {
		_ = s.store.RevokeRefresh(r.Context(), claims.Subject, claims.ID)
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	writeJSON(w, http.StatusOK, view(u))
}

func (s *Server) handleDeleteAccount(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	if err := s.store.DeleteUser(r.Context(), u.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete the account")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// requireUser is the gate on a protected route: it reads the bearer access token, checks it, loads the
// account, and puts it on the request context. A request without a good access token is refused before
// the handler runs.
func (s *Server) requireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		token, ok := strings.CutPrefix(header, "Bearer ")
		if !ok || token == "" {
			writeError(w, http.StatusUnauthorized, "sign in to continue")
			return
		}
		claims, err := s.signer.Verify(token, time.Now())
		if err != nil || claims.Type != auth.AccessToken {
			writeError(w, http.StatusUnauthorized, "session expired")
			return
		}
		u, err := s.store.UserByID(r.Context(), claims.Subject)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "session expired")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userKey, u)))
	})
}

// userFrom returns the authenticated account a requireUser gate placed on the context.
func userFrom(ctx context.Context) store.User {
	u, _ := ctx.Value(userKey).(store.User)
	return u
}
