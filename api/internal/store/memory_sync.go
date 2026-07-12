package store

import (
	"context"
	"sort"
	"time"
)

// The sync half of the in-memory store: per-account note ciphertext keyed by note id, and a per-account
// monotonic rev counter that both versions a note and drives the change feed. It reuses the Memory
// mutex declared alongside the account maps, so all of a store's state is guarded together.

// noteState is added lazily per user so a store that only does auth carries no sync maps.
func (m *Memory) noteState(userID string) map[string]SyncNote {
	if m.notes == nil {
		m.notes = map[string]map[string]SyncNote{}
	}
	if m.notes[userID] == nil {
		m.notes[userID] = map[string]SyncNote{}
	}
	return m.notes[userID]
}

func (m *Memory) nextRev(userID string) int64 {
	if m.rev == nil {
		m.rev = map[string]int64{}
	}
	m.rev[userID]++
	return m.rev[userID]
}

func (m *Memory) PutNote(_ context.Context, userID string, note SyncNote, baseRev int64) (SyncNote, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	notes := m.noteState(userID)
	if existing, ok := notes[note.NoteID]; ok && existing.Rev != baseRev {
		return existing, ErrConflict
	}
	note.Rev = m.nextRev(userID)
	note.Deleted = false
	note.UpdatedAt = time.Now()
	notes[note.NoteID] = note
	return note, nil
}

func (m *Memory) GetNote(_ context.Context, userID, noteID string) (SyncNote, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.notes == nil {
		return SyncNote{}, ErrNotFound
	}
	note, ok := m.notes[userID][noteID]
	if !ok {
		return SyncNote{}, ErrNotFound
	}
	return note, nil
}

func (m *Memory) NotesSince(_ context.Context, userID string, sinceRev int64, limit int) ([]SyncNote, int64, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var out []SyncNote
	for _, note := range m.notes[userID] {
		if note.Rev > sinceRev {
			out = append(out, note)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Rev < out[j].Rev })
	cursor := sinceRev
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	if n := len(out); n > 0 {
		cursor = out[n-1].Rev
	}
	return out, cursor, nil
}

func (m *Memory) DeleteNote(_ context.Context, userID, noteID string, baseRev int64) (SyncNote, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	notes := m.noteState(userID)
	existing, ok := notes[noteID]
	if !ok {
		return SyncNote{}, ErrNotFound
	}
	if existing.Rev != baseRev {
		return existing, ErrConflict
	}
	tomb := SyncNote{NoteID: noteID, Rev: m.nextRev(userID), Deleted: true, UpdatedAt: time.Now()}
	notes[noteID] = tomb
	return tomb, nil
}
