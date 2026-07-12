package api

import (
	"errors"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/avosa/handwriting-notes/api/internal/auth"
	"github.com/avosa/handwriting-notes/api/internal/store"
)

// Encrypted attachment blobs. The client encrypts an attachment and stores the ciphertext here; the
// server never reads it. A transfer does not carry the account's session token — instead the client
// first asks for a short-lived, single-blob, single-operation capability URL, and uploads or fetches
// through that. The capability is the least privilege the transfer needs and expires in minutes, so a
// leaked URL grants one operation on one blob for a short while and nothing more.

const (
	maxBlobBytes = 64 << 20 // 64 MiB, an upper bound on one encrypted attachment
	grantTTL     = 5 * time.Minute
)

// grantView is the answer to a capability request: the URL to use and when it stops working.
type grantView struct {
	URL     string `json:"url"`
	Expires string `json:"expires"`
}

// handleGrantBlob issues a capability URL for one operation on one blob, owned by the caller. op is
// "put" to upload or "get" to download.
func (s *Server) handleGrantBlob(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	blobID := r.PathValue("id")
	op := r.URL.Query().Get("op")
	if blobID == "" || (op != "put" && op != "get") {
		writeError(w, http.StatusBadRequest, "need a blob id and op of put or get")
		return
	}
	expires := time.Now().Add(grantTTL)
	grant, err := s.signer.SignCapability(auth.Capability{Subject: u.ID, Resource: blobID, Op: op, Expires: expires.Unix()})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not grant access")
		return
	}
	grantURL := "/api/blobs/" + url.PathEscape(blobID) + "?cap=" + url.QueryEscape(grant)
	writeJSON(w, http.StatusOK, grantView{URL: grantURL, Expires: expires.UTC().Format(time.RFC3339)})
}

// blobCapability checks the capability on a transfer request: it must be valid, unexpired, for this
// blob, and for the operation being attempted. It returns the account id the capability was granted
// to, which is whose blob is read or written.
func (s *Server) blobCapability(w http.ResponseWriter, r *http.Request, op string) (string, bool) {
	c, err := s.signer.VerifyCapability(r.URL.Query().Get("cap"), time.Now())
	if err != nil || c.Op != op || c.Resource != r.PathValue("id") {
		writeError(w, http.StatusForbidden, "invalid or expired link")
		return "", false
	}
	return c.Subject, true
}

// handlePutBlob uploads an encrypted blob through a put capability. The body is raw ciphertext bytes.
func (s *Server) handlePutBlob(w http.ResponseWriter, r *http.Request) {
	owner, ok := s.blobCapability(w, r, "put")
	if !ok {
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBlobBytes))
	if err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "attachment too large")
		return
	}
	if err := s.store.PutBlob(r.Context(), owner, r.PathValue("id"), body); err != nil {
		writeError(w, http.StatusInternalServerError, "could not store the attachment")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// handleGetBlob downloads an encrypted blob through a get capability, as raw ciphertext bytes.
func (s *Server) handleGetBlob(w http.ResponseWriter, r *http.Request) {
	owner, ok := s.blobCapability(w, r, "get")
	if !ok {
		return
	}
	blob, err := s.store.GetBlob(r.Context(), owner, r.PathValue("id"))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "no such attachment")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not read the attachment")
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(blob.Ciphertext)
}

// handleDeleteBlob removes an encrypted blob. Deleting is done with the session token rather than a
// capability, since only the owner should be able to destroy an attachment.
func (s *Server) handleDeleteBlob(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	if err := s.store.DeleteBlob(r.Context(), u.ID, r.PathValue("id")); err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete the attachment")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
