package auth

import (
	"crypto/sha256"
	"crypto/subtle"
)

// PKCE (Proof Key for Code Exchange) stops an intercepted OAuth authorization code from being
// redeemed by anyone but the client that started the flow. The client makes a secret verifier, sends
// only its SHA-256 challenge to the provider, and later proves it holds the verifier. These helpers
// are the server side of checking that proof, and the client side is mirrored in the app.

// Challenge returns the S256 challenge for a verifier: the base64url of its SHA-256. This is what is
// sent to the authorization endpoint.
func Challenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return b64.EncodeToString(sum[:])
}

// VerifyChallenge reports whether a verifier matches a previously sent challenge, in constant time.
func VerifyChallenge(verifier, challenge string) bool {
	want := Challenge(verifier)
	return subtle.ConstantTimeCompare([]byte(want), []byte(challenge)) == 1
}

// NewVerifier makes a random PKCE verifier with enough entropy to be unguessable. The client normally
// creates its own; this is here for tests and any server-initiated flow.
func NewVerifier() (string, error) {
	return RandomID(32)
}
