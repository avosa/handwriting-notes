package store

import (
	"context"
	"strings"
	"sync"
	"time"
)

// Memory is an in-memory Store for local runs and tests. It is safe for concurrent use and holds
// accounts, sessions, encrypted notes, and encrypted blobs in maps. A database-backed store
// implements the same interface.
type Memory struct {
	mu      sync.RWMutex
	byID    map[string]User
	byEmail map[string]string              // lower-cased email -> user id
	refresh map[string]map[string]int64    // user id -> refresh token id -> expiry unix
	notes   map[string]map[string]SyncNote // user id -> note id -> ciphertext record
	rev     map[string]int64               // user id -> last assigned rev
	blobs   map[string]map[string]Blob     // user id -> blob id -> ciphertext blob
}

// NewMemory returns an empty in-memory store.
func NewMemory() *Memory {
	return &Memory{
		byID:    map[string]User{},
		byEmail: map[string]string{},
		refresh: map[string]map[string]int64{},
	}
}

// Ping always succeeds: memory is always reachable.
func (m *Memory) Ping(ctx context.Context) error { return ctx.Err() }

// Close has nothing to release.
func (m *Memory) Close() error { return nil }

func emailKey(email string) string { return strings.ToLower(strings.TrimSpace(email)) }

func (m *Memory) CreateUser(_ context.Context, u User) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := emailKey(u.Email)
	if _, taken := m.byEmail[key]; taken {
		return ErrConflict
	}
	m.byID[u.ID] = u
	m.byEmail[key] = u.ID
	return nil
}

func (m *Memory) UserByEmail(_ context.Context, email string) (User, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	id, ok := m.byEmail[emailKey(email)]
	if !ok {
		return User{}, ErrNotFound
	}
	return m.byID[id], nil
}

func (m *Memory) UserByID(_ context.Context, id string) (User, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	u, ok := m.byID[id]
	if !ok {
		return User{}, ErrNotFound
	}
	return u, nil
}

func (m *Memory) DeleteUser(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	u, ok := m.byID[id]
	if !ok {
		return ErrNotFound
	}
	delete(m.byEmail, emailKey(u.Email))
	delete(m.byID, id)
	delete(m.refresh, id)
	delete(m.notes, id)
	delete(m.rev, id)
	delete(m.blobs, id)
	return nil
}

func (m *Memory) TrustRefresh(_ context.Context, userID, tokenID string, expires time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.refresh[userID] == nil {
		m.refresh[userID] = map[string]int64{}
	}
	m.refresh[userID][tokenID] = expires.Unix()
	return nil
}

func (m *Memory) RefreshTrusted(_ context.Context, userID, tokenID string) (bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	exp, ok := m.refresh[userID][tokenID]
	if !ok {
		return false, nil
	}
	return exp > time.Now().Unix(), nil
}

func (m *Memory) RotateRefresh(_ context.Context, userID, oldID, newID string, expires time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	set := m.refresh[userID]
	if set == nil {
		set = map[string]int64{}
		m.refresh[userID] = set
	}
	delete(set, oldID)
	set[newID] = expires.Unix()
	return nil
}

func (m *Memory) RevokeRefresh(_ context.Context, userID, tokenID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.refresh[userID], tokenID)
	return nil
}

func (m *Memory) RevokeAllRefresh(_ context.Context, userID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.refresh, userID)
	return nil
}
