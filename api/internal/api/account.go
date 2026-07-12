package api

import (
	"encoding/base64"
	"net/http"
	"time"
)

// GDPR data portability: an account can take everything the server holds for it. Because the server
// only ever holds ciphertext, the export is the account's encrypted notes and attachments plus its
// profile — the writer holds the keys to read it, which is the point. Deletion is the account-delete
// endpoint, which cascades notes, blobs, and sessions.

// exportBundle is the whole of what the server holds for an account.
type exportBundle struct {
	ExportedAt string       `json:"exportedAt"`
	User       userView     `json:"user"`
	Notes      []exportNote `json:"notes"`
	Blobs      []exportBlob `json:"blobs"`
	Note       string       `json:"note"`
}

type exportNote struct {
	NoteID     string `json:"noteId"`
	Ciphertext string `json:"ciphertext"`
	Rev        int64  `json:"rev"`
	Deleted    bool   `json:"deleted"`
}

type exportBlob struct {
	BlobID     string `json:"blobId"`
	Ciphertext string `json:"ciphertext"`
}

// handleExport streams the account's whole dataset as a JSON bundle for download.
func (s *Server) handleExport(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())

	notes, err := s.store.AllNotes(r.Context(), u.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not export notes")
		return
	}
	blobs, err := s.store.AllBlobs(r.Context(), u.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not export attachments")
		return
	}

	bundle := exportBundle{
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
		User:       view(u),
		Notes:      make([]exportNote, 0, len(notes)),
		Blobs:      make([]exportBlob, 0, len(blobs)),
		Note:       "Notes and attachments are end-to-end encrypted; decrypt them with your account key.",
	}
	for _, n := range notes {
		bundle.Notes = append(bundle.Notes, exportNote{
			NoteID:     n.NoteID,
			Ciphertext: base64.StdEncoding.EncodeToString(n.Ciphertext),
			Rev:        n.Rev,
			Deleted:    n.Deleted,
		})
	}
	for _, b := range blobs {
		bundle.Blobs = append(bundle.Blobs, exportBlob{
			BlobID:     b.BlobID,
			Ciphertext: base64.StdEncoding.EncodeToString(b.Ciphertext),
		})
	}

	w.Header().Set("Content-Disposition", `attachment; filename="notes-export.json"`)
	writeJSON(w, http.StatusOK, bundle)
}
