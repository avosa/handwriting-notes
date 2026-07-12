// Package store is the persistence seam. The service is a thin relay that mostly holds ciphertext it
// cannot read, so the interface stays small and grows one method at a time as accounts, sync, and
// blobs arrive. Keeping every query behind this interface means the rest of the service never
// depends on a particular database, and a fake in-memory store makes the handlers testable without
// one.
package store

import (
	"context"

	"github.com/avosa/handwriting-notes/api/internal/config"
)

// Store is everything the service asks of its database. Today that is only a liveness check; account,
// sync, and blob methods join it as those features land, each still a thin read or write.
type Store interface {
	// Ping checks that the store is reachable, for the health endpoint and startup.
	Ping(ctx context.Context) error
	// Close releases the store's resources.
	Close() error
}

// Open returns the store for the given configuration. With no database URL it returns the in-memory
// store, which is what local runs and tests use; a real deployment sets DATABASE_URL and a database
// backed store is opened instead (added with the first persisted feature).
func Open(_ context.Context, cfg config.Config) (Store, error) {
	if cfg.DatabaseURL == "" {
		return NewMemory(), nil
	}
	// A database-backed store is wired here as accounts and sync land; until then a configured URL
	// still falls back to memory so the service always starts.
	return NewMemory(), nil
}
