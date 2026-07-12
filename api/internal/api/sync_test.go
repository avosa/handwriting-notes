package api

import (
	"encoding/base64"
	"net/http"
	"strconv"
	"testing"
)

func b64(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }

func TestSyncPushPull(t *testing.T) {
	h := testServer()
	access, _ := signup(t, h, "a@b.com", "password123")

	// Push a new note (baseRev 0).
	rec, out := do(t, h, http.MethodPut, "/api/sync/notes/n1", access, map[string]any{"ciphertext": b64("secret-1"), "baseRev": 0})
	if rec.Code != http.StatusOK {
		t.Fatalf("push: status %d body %v", rec.Code, out)
	}
	rev1 := int64(out["rev"].(float64))
	if rev1 <= 0 {
		t.Fatalf("expected a positive rev, got %d", rev1)
	}

	// Pull from the start returns it.
	rec, out = do(t, h, http.MethodGet, "/api/sync/changes?since=0", access, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("changes: status %d", rec.Code)
	}
	notes := out["notes"].([]any)
	if len(notes) != 1 {
		t.Fatalf("expected 1 change, got %d", len(notes))
	}
	first := notes[0].(map[string]any)
	if first["ciphertext"].(string) != b64("secret-1") {
		t.Fatal("ciphertext not round-tripped")
	}

	// Pull from the current cursor returns nothing new.
	rec, out = do(t, h, http.MethodGet, "/api/sync/changes?since="+itoa(rev1), access, nil)
	if len(out["notes"].([]any)) != 0 {
		t.Fatal("expected no changes past the cursor")
	}
}

func TestSyncConflict(t *testing.T) {
	h := testServer()
	access, _ := signup(t, h, "a@b.com", "password123")
	rec, out := do(t, h, http.MethodPut, "/api/sync/notes/n1", access, map[string]any{"ciphertext": b64("v1"), "baseRev": 0})
	rev1 := int64(out["rev"].(float64))

	// A second push with the right base rev succeeds.
	rec, out = do(t, h, http.MethodPut, "/api/sync/notes/n1", access, map[string]any{"ciphertext": b64("v2"), "baseRev": rev1})
	if rec.Code != http.StatusOK {
		t.Fatalf("in-order push: status %d", rec.Code)
	}

	// A push with the stale base rev is a conflict, and the server returns the current note.
	rec, out = do(t, h, http.MethodPut, "/api/sync/notes/n1", access, map[string]any{"ciphertext": b64("v3"), "baseRev": rev1})
	if rec.Code != http.StatusConflict {
		t.Fatalf("stale push: status %d, want 409", rec.Code)
	}
	if out["ciphertext"].(string) != b64("v2") {
		t.Fatal("conflict should return the current ciphertext")
	}
}

func TestSyncDeleteTombstone(t *testing.T) {
	h := testServer()
	access, _ := signup(t, h, "a@b.com", "password123")
	_, out := do(t, h, http.MethodPut, "/api/sync/notes/n1", access, map[string]any{"ciphertext": b64("v1"), "baseRev": 0})
	rev1 := int64(out["rev"].(float64))

	rec, out := do(t, h, http.MethodDelete, "/api/sync/notes/n1?baseRev="+itoa(rev1), access, nil)
	if rec.Code != http.StatusOK || out["deleted"] != true {
		t.Fatalf("delete: status %d body %v", rec.Code, out)
	}
	// The tombstone shows up in the change feed so other devices learn of the delete.
	_, out = do(t, h, http.MethodGet, "/api/sync/changes?since=0", access, nil)
	notes := out["notes"].([]any)
	if len(notes) != 1 || notes[0].(map[string]any)["deleted"] != true {
		t.Fatalf("expected a tombstone in changes, got %v", notes)
	}
}

func TestSyncOwnershipIsolation(t *testing.T) {
	h := testServer()
	alice, _ := signup(t, h, "alice@b.com", "password123")
	bob, _ := signup(t, h, "bob@b.com", "password123")

	do(t, h, http.MethodPut, "/api/sync/notes/n1", alice, map[string]any{"ciphertext": b64("alice-secret"), "baseRev": 0})

	// Bob cannot read Alice's note...
	if rec, _ := do(t, h, http.MethodGet, "/api/sync/notes/n1", bob, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("bob reading alice's note: status %d, want 404", rec.Code)
	}
	// ...and Bob's change feed is empty.
	_, out := do(t, h, http.MethodGet, "/api/sync/changes?since=0", bob, nil)
	if len(out["notes"].([]any)) != 0 {
		t.Fatal("bob should see none of alice's notes")
	}
}

func TestSyncRequiresAuth(t *testing.T) {
	h := testServer()
	if rec, _ := do(t, h, http.MethodGet, "/api/sync/changes?since=0", "", nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated sync: status %d, want 401", rec.Code)
	}
}

func itoa(n int64) string {
	return strconv.FormatInt(n, 10)
}
