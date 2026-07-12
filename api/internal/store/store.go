// Package store is the persistence seam. The service is a thin relay that mostly holds ciphertext it
// cannot read, so the interface stays small and grows one method at a time as accounts, sync, and
// blobs arrive. Keeping every query behind this interface means the rest of the service never
// depends on a particular database, and a fake in-memory store makes the handlers testable without
// one.
package store

import (
	"context"
	"errors"
	"time"

	"github.com/avosa/handwriting-notes/api/internal/config"
)

// Common store errors the handlers translate into HTTP responses.
var (
	// ErrNotFound is returned when a lookup finds nothing.
	ErrNotFound = errors.New("not found")
	// ErrConflict is returned when a write would break a uniqueness rule, e.g. a duplicate email.
	ErrConflict = errors.New("conflict")
)

// User is an account. The password hash is the self-describing PBKDF2 hash; the server never holds a
// plaintext password. An account created only through OAuth has an empty hash and signs in that way.
type User struct {
	ID           string
	Email        string
	PasswordHash string
	CreatedAt    time.Time
}

// SyncNote is one note as the server holds it: opaque ciphertext the server cannot read, and the
// bookkeeping that lets devices sync without the server ever learning what a note says. Rev is a
// per-account sequence the server assigns on every write; a device pulls everything with a higher rev
// than it last saw, and pushes with the rev it based its edit on so a clash is caught.
type SyncNote struct {
	NoteID     string
	Ciphertext []byte
	Rev        int64
	Deleted    bool
	UpdatedAt  time.Time
}

// Store is everything the service asks of its database: accounts, and the set of refresh tokens each
// account currently trusts, which is what lets a refresh token be rotated and revoked. Sync and blob
// methods join it as those features land, each still a thin read or write.
type Store interface {
	// Ping checks that the store is reachable, for the health endpoint and startup.
	Ping(ctx context.Context) error
	// Close releases the store's resources.
	Close() error

	// CreateUser stores a new account, returning ErrConflict if the email is already taken.
	CreateUser(ctx context.Context, u User) error
	// UserByEmail looks an account up by its email, returning ErrNotFound if there is none.
	UserByEmail(ctx context.Context, email string) (User, error)
	// UserByID looks an account up by its id, returning ErrNotFound if there is none.
	UserByID(ctx context.Context, id string) (User, error)
	// DeleteUser removes an account and everything the store holds for it.
	DeleteUser(ctx context.Context, id string) error

	// TrustRefresh records that a refresh token id is valid for a user, with when it expires so a
	// sweep can drop stale ones.
	TrustRefresh(ctx context.Context, userID, tokenID string, expires time.Time) error
	// RefreshTrusted reports whether a refresh token id is still trusted for a user.
	RefreshTrusted(ctx context.Context, userID, tokenID string) (bool, error)
	// RotateRefresh atomically revokes the old refresh token id and trusts the new one, so a refresh
	// is single-use and a replay of the old token is refused.
	RotateRefresh(ctx context.Context, userID, oldID, newID string, expires time.Time) error
	// RevokeRefresh drops one refresh token id, for signing out one device.
	RevokeRefresh(ctx context.Context, userID, tokenID string) error
	// RevokeAllRefresh drops every refresh token for a user, for signing out everywhere.
	RevokeAllRefresh(ctx context.Context, userID string) error

	// PutNote stores a note's ciphertext for a user. baseRev is the rev the device based its edit on;
	// if the stored note has moved past it, the write is refused with ErrConflict and the current note
	// is returned so the device can merge. On success a new rev is assigned and the stored note
	// returned. A first write for a note uses baseRev 0.
	PutNote(ctx context.Context, userID string, note SyncNote, baseRev int64) (SyncNote, error)
	// GetNote returns one note's stored ciphertext, or ErrNotFound.
	GetNote(ctx context.Context, userID, noteID string) (SyncNote, error)
	// NotesSince returns the notes for a user whose rev is greater than sinceRev, oldest change first,
	// up to limit, with the highest rev returned as the cursor for the next pull.
	NotesSince(ctx context.Context, userID string, sinceRev int64, limit int) (notes []SyncNote, cursor int64, err error)
	// DeleteNote tombstones a note (a delete still syncs, so other devices learn of it). Same
	// optimistic check as PutNote.
	DeleteNote(ctx context.Context, userID, noteID string, baseRev int64) (SyncNote, error)
}

// Open returns the store for the given configuration. With no database URL it returns the in-memory
// store, which is what local runs and tests use; a real deployment sets DATABASE_URL and a database
// backed store is opened instead (added with the deploy work).
func Open(_ context.Context, cfg config.Config) (Store, error) {
	if cfg.DatabaseURL == "" {
		return NewMemory(), nil
	}
	// A database-backed store is wired here once a database is provisioned; until then a configured
	// URL still falls back to memory so the service always starts.
	return NewMemory(), nil
}
