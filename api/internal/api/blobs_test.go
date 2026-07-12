package api

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// grantURL asks for a capability URL for an op on a blob and returns it.
func grantURL(t *testing.T, h http.Handler, access, blobID, op string) string {
	t.Helper()
	rec, out := do(t, h, http.MethodPost, "/api/blobs/"+blobID+"/grant?op="+op, access, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("grant %s: status %d body %v", op, rec.Code, out)
	}
	return out["url"].(string)
}

// putBytes/getBytes drive a raw-bytes transfer through a capability URL.
func putBytes(t *testing.T, h http.Handler, capURL string, data []byte) int {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, capURL, bytes.NewReader(data))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code
}

func getBytes(t *testing.T, h http.Handler, capURL string) (int, []byte) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, capURL, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code, rec.Body.Bytes()
}

func TestBlobRoundTrip(t *testing.T) {
	h := testServer()
	access, _ := signup(t, h, "a@b.com", "password123")

	putCap := grantURL(t, h, access, "att1", "put")
	if code := putBytes(t, h, putCap, []byte("ciphertext-bytes")); code != http.StatusOK {
		t.Fatalf("put: status %d", code)
	}
	getCap := grantURL(t, h, access, "att1", "get")
	code, body := getBytes(t, h, getCap)
	if code != http.StatusOK || string(body) != "ciphertext-bytes" {
		t.Fatalf("get: status %d body %q", code, body)
	}
}

func TestBlobWrongOpAndBadCap(t *testing.T) {
	h := testServer()
	access, _ := signup(t, h, "a@b.com", "password123")

	// A get capability cannot be used to put.
	getCap := grantURL(t, h, access, "att1", "get")
	if code := putBytes(t, h, getCap, []byte("x")); code != http.StatusForbidden {
		t.Fatalf("put with get cap: status %d, want 403", code)
	}
	// A tampered capability is rejected.
	putCap := grantURL(t, h, access, "att1", "put")
	if code := putBytes(t, h, putCap+"x", []byte("x")); code != http.StatusForbidden {
		t.Fatalf("tampered cap: status %d, want 403", code)
	}
	// No capability at all is rejected.
	if code := putBytes(t, h, "/api/blobs/att1", []byte("x")); code != http.StatusForbidden {
		t.Fatalf("no cap: status %d, want 403", code)
	}
}

func TestBlobCapabilityIsScopedToOneBlob(t *testing.T) {
	h := testServer()
	access, _ := signup(t, h, "a@b.com", "password123")
	// A capability granted for att1 cannot be redirected to att2 by swapping the path.
	putCap := grantURL(t, h, access, "att1", "put") // .../att1?cap=...
	moved := strings.Replace(putCap, "/api/blobs/att1", "/api/blobs/att2", 1)
	if code := putBytes(t, h, moved, []byte("x")); code != http.StatusForbidden {
		t.Fatalf("cap reused on another blob: status %d, want 403", code)
	}
}

func TestBlobCrossAccountCannotGrant(t *testing.T) {
	h := testServer()
	alice, _ := signup(t, h, "alice@b.com", "password123")
	bob, _ := signup(t, h, "bob@b.com", "password123")

	// Alice stores a blob.
	putBytes(t, h, grantURL(t, h, alice, "att1", "put"), []byte("alice"))
	// Bob's capability is signed for Bob's account, so it reads Bob's (empty) att1, not Alice's.
	code, _ := getBytes(t, h, grantURL(t, h, bob, "att1", "get"))
	if code != http.StatusNotFound {
		t.Fatalf("bob reading his own empty att1: status %d, want 404", code)
	}
}

func TestBlobGrantRequiresAuth(t *testing.T) {
	h := testServer()
	if rec, _ := do(t, h, http.MethodPost, "/api/blobs/att1/grant?op=put", "", nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated grant: status %d, want 401", rec.Code)
	}
}

// A tiny check that a grant URL is well-formed (parses, carries a cap query).
func TestGrantURLShape(t *testing.T) {
	h := testServer()
	access, _ := signup(t, h, "a@b.com", "password123")
	rec, out := do(t, h, http.MethodPost, "/api/blobs/att1/grant?op=get", access, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("grant: status %d", rec.Code)
	}
	u, err := url.Parse(out["url"].(string))
	if err != nil || u.Query().Get("cap") == "" {
		t.Fatalf("grant url malformed: %v", out["url"])
	}
	if _, ok := out["expires"].(string); !ok {
		t.Fatal("grant should return an expiry")
	}
}
