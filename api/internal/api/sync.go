package api

import (
	"encoding/base64"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/avosa/handwriting-notes/api/internal/store"
)

// The sync endpoints are a relay for ciphertext. The server stores and hands back opaque bytes it
// cannot read — the client encrypts a note before it ever leaves the device — and adds only the
// bookkeeping that lets devices reconcile: a per-account rev on every write, an optimistic base-rev
// check that catches a clash, and a change feed to pull what is new. Every route is behind the
// bearer-token gate and scoped to the caller's own account, so one account can never reach another's.

// The largest a single encrypted note may be, a guard against a runaway upload. Big attachments go
// through blob storage, not here.
const maxNoteBytes = 8 << 20 // 8 MiB

// noteBody is a note as it crosses the wire: ciphertext as base64 and the rev the edit was based on.
type noteBody struct {
	Ciphertext string `json:"ciphertext"`
	BaseRev    int64  `json:"baseRev"`
}

// noteView is a stored note returned to the client.
type noteView struct {
	NoteID     string `json:"noteId"`
	Ciphertext string `json:"ciphertext"`
	Rev        int64  `json:"rev"`
	Deleted    bool   `json:"deleted"`
	UpdatedAt  string `json:"updatedAt"`
}

func noteToView(n store.SyncNote) noteView {
	return noteView{
		NoteID:     n.NoteID,
		Ciphertext: base64.StdEncoding.EncodeToString(n.Ciphertext),
		Rev:        n.Rev,
		Deleted:    n.Deleted,
		UpdatedAt:  n.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

// changesView is a page of the change feed: the notes newer than the requested cursor, and the cursor
// to pass next time.
type changesView struct {
	Notes  []noteView `json:"notes"`
	Cursor int64      `json:"cursor"`
}

// handlePutNote stores a note's ciphertext. A base-rev that no longer matches the stored note is a
// conflict: the current note is returned with 409 so the client can merge and try again.
func (s *Server) handlePutNote(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	noteID := r.PathValue("id")
	if noteID == "" {
		writeError(w, http.StatusBadRequest, "missing note id")
		return
	}
	var body noteBody
	if !decodeJSON(w, r, &body) {
		return
	}
	cipher, err := base64.StdEncoding.DecodeString(body.Ciphertext)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ciphertext must be base64")
		return
	}
	if len(cipher) > maxNoteBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "note too large")
		return
	}
	stored, err := s.store.PutNote(r.Context(), u.ID, store.SyncNote{NoteID: noteID, Ciphertext: cipher}, body.BaseRev)
	if errors.Is(err, store.ErrConflict) {
		writeJSON(w, http.StatusConflict, noteToView(stored))
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not save the note")
		return
	}
	writeJSON(w, http.StatusOK, noteToView(stored))
}

// handleGetNote returns one note's ciphertext.
func (s *Server) handleGetNote(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	note, err := s.store.GetNote(r.Context(), u.ID, r.PathValue("id"))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "no such note")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not read the note")
		return
	}
	writeJSON(w, http.StatusOK, noteToView(note))
}

// handleDeleteNote tombstones a note, subject to the same base-rev check, so the delete syncs to other
// devices rather than a note silently reappearing from one that still has it.
func (s *Server) handleDeleteNote(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	baseRev, _ := strconv.ParseInt(r.URL.Query().Get("baseRev"), 10, 64)
	tomb, err := s.store.DeleteNote(r.Context(), u.ID, r.PathValue("id"), baseRev)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "no such note")
		return
	}
	if errors.Is(err, store.ErrConflict) {
		writeJSON(w, http.StatusConflict, noteToView(tomb))
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete the note")
		return
	}
	writeJSON(w, http.StatusOK, noteToView(tomb))
}

// handleChanges is the pull side of sync: everything changed since the client's cursor, so a device
// catches up on what other devices wrote. A tombstone is included, so deletes propagate.
func (s *Server) handleChanges(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	since, _ := strconv.ParseInt(r.URL.Query().Get("since"), 10, 64)
	limit := 500
	if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v < limit {
		limit = v
	}
	notes, cursor, err := s.store.NotesSince(r.Context(), u.ID, since, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not read changes")
		return
	}
	views := make([]noteView, 0, len(notes))
	for _, n := range notes {
		views = append(views, noteToView(n))
	}
	writeJSON(w, http.StatusOK, changesView{Notes: views, Cursor: cursor})
}
