// Package auth holds the security primitives the service is built on: hashing passwords, signing and
// checking session tokens, and the PKCE handshake for OAuth. It depends only on the standard library,
// so there is nothing to trust beyond Go's own crypto.
package auth

import (
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
)

// Password hashing parameters. PBKDF2-HMAC-SHA256 with a high iteration count is stdlib-only and
// strong enough for stored passwords; the count is recorded in each hash so it can be raised later
// without breaking existing accounts.
const (
	pwIterations = 210_000
	pwSaltLen    = 16
	pwKeyLen     = 32
)

var b64 = base64.RawURLEncoding

// HashPassword returns a self-describing hash of the form `pbkdf2$sha256$iters$salt$key`, so a stored
// hash carries everything needed to check it — no separate parameter store, and the cost can be
// raised per account over time.
func HashPassword(password string) (string, error) {
	salt := make([]byte, pwSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key, err := pbkdf2.Key(sha256.New, password, salt, pwIterations, pwKeyLen)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("pbkdf2$sha256$%d$%s$%s", pwIterations, b64.EncodeToString(salt), b64.EncodeToString(key)), nil
}

// VerifyPassword reports whether the password matches the encoded hash, comparing in constant time so
// a wrong guess and a right one take the same time.
func VerifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 5 || parts[0] != "pbkdf2" || parts[1] != "sha256" {
		return false
	}
	iters, err := strconv.Atoi(parts[2])
	if err != nil || iters <= 0 {
		return false
	}
	salt, err := b64.DecodeString(parts[3])
	if err != nil {
		return false
	}
	want, err := b64.DecodeString(parts[4])
	if err != nil {
		return false
	}
	got, err := pbkdf2.Key(sha256.New, password, salt, iters, len(want))
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare(got, want) == 1
}

// RandomID returns a URL-safe random identifier of n bytes of entropy, for token ids, session ids,
// and the like.
func RandomID(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return b64.EncodeToString(buf), nil
}
