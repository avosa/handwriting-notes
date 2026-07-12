package store

import (
	"context"
	"time"
)

// The blob half of the in-memory store: per-account encrypted attachment ciphertext keyed by blob id.
// Like notes, blobs are opaque bytes the store never reads.

func (m *Memory) blobState(userID string) map[string]Blob {
	if m.blobs == nil {
		m.blobs = map[string]map[string]Blob{}
	}
	if m.blobs[userID] == nil {
		m.blobs[userID] = map[string]Blob{}
	}
	return m.blobs[userID]
}

func (m *Memory) PutBlob(_ context.Context, userID, blobID string, ciphertext []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	buf := make([]byte, len(ciphertext))
	copy(buf, ciphertext)
	m.blobState(userID)[blobID] = Blob{BlobID: blobID, Ciphertext: buf, UpdatedAt: time.Now()}
	return nil
}

func (m *Memory) GetBlob(_ context.Context, userID, blobID string) (Blob, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	b, ok := m.blobs[userID][blobID]
	if !ok {
		return Blob{}, ErrNotFound
	}
	return b, nil
}

func (m *Memory) DeleteBlob(_ context.Context, userID, blobID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.blobs[userID], blobID)
	return nil
}

// AllBlobs returns every encrypted blob for a user, for a data export.
func (m *Memory) AllBlobs(_ context.Context, userID string) ([]Blob, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]Blob, 0, len(m.blobs[userID]))
	for _, b := range m.blobs[userID] {
		out = append(out, b)
	}
	return out, nil
}
