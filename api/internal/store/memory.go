package store

import "context"

// Memory is an in-memory Store for local runs and tests. It holds nothing yet — the service has no
// persisted state until accounts arrive — but it satisfies the interface so the server starts and
// the handlers can be exercised without a database.
type Memory struct{}

// NewMemory returns an empty in-memory store.
func NewMemory() *Memory { return &Memory{} }

// Ping always succeeds: memory is always reachable.
func (m *Memory) Ping(ctx context.Context) error {
	return ctx.Err()
}

// Close has nothing to release.
func (m *Memory) Close() error { return nil }
