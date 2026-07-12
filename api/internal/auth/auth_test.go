package auth

import (
	"testing"
	"time"
)

func TestPasswordRoundTrip(t *testing.T) {
	hash, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if !VerifyPassword("correct horse battery staple", hash) {
		t.Fatal("correct password did not verify")
	}
	if VerifyPassword("wrong", hash) {
		t.Fatal("wrong password verified")
	}
}

func TestPasswordHashesDiffer(t *testing.T) {
	a, _ := HashPassword("same")
	b, _ := HashPassword("same")
	if a == b {
		t.Fatal("two hashes of the same password should differ (random salt)")
	}
}

func TestVerifyRejectsGarbage(t *testing.T) {
	for _, bad := range []string{"", "nope", "pbkdf2$sha256$notanumber$x$y", "a$b$c$d$e"} {
		if VerifyPassword("x", bad) {
			t.Fatalf("garbage hash %q verified", bad)
		}
	}
}

func TestTokenSignAndVerify(t *testing.T) {
	s := NewSigner([]byte("secret"))
	now := time.Unix(1_700_000_000, 0)
	tok, err := s.Sign(Claims{Subject: "user1", Type: AccessToken, ID: "id1", IssuedAt: now.Unix(), Expires: now.Add(time.Hour).Unix()})
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	c, err := s.Verify(tok, now)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if c.Subject != "user1" || c.Type != AccessToken {
		t.Fatalf("claims mismatch: %+v", c)
	}
}

func TestTokenExpiry(t *testing.T) {
	s := NewSigner([]byte("secret"))
	now := time.Unix(1_700_000_000, 0)
	tok, _ := s.Sign(Claims{Subject: "u", Type: AccessToken, Expires: now.Add(time.Minute).Unix()})
	if _, err := s.Verify(tok, now.Add(2*time.Minute)); err != ErrTokenExpired {
		t.Fatalf("got %v, want ErrTokenExpired", err)
	}
}

func TestTokenTamperAndWrongSecret(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	tok, _ := NewSigner([]byte("secret")).Sign(Claims{Subject: "u", Expires: now.Add(time.Hour).Unix()})
	if _, err := NewSigner([]byte("other")).Verify(tok, now); err != ErrTokenInvalid {
		t.Fatalf("wrong secret: got %v, want ErrTokenInvalid", err)
	}
	if _, err := NewSigner([]byte("secret")).Verify(tok+"x", now); err == nil {
		t.Fatal("tampered token verified")
	}
}

func TestIssuePair(t *testing.T) {
	s := NewSigner([]byte("secret"))
	now := time.Unix(1_700_000_000, 0)
	p, err := s.Issue("user1", now)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	ac, err := s.Verify(p.Access, now)
	if err != nil || ac.Type != AccessToken {
		t.Fatalf("access: %v %+v", err, ac)
	}
	rc, err := s.Verify(p.Refresh, now)
	if err != nil || rc.Type != RefreshToken || rc.ID != p.RefreshID {
		t.Fatalf("refresh: %v %+v", err, rc)
	}
	if p.Access == p.Refresh {
		t.Fatal("access and refresh tokens should differ")
	}
}

func TestPKCE(t *testing.T) {
	v, err := NewVerifier()
	if err != nil {
		t.Fatalf("verifier: %v", err)
	}
	ch := Challenge(v)
	if !VerifyChallenge(v, ch) {
		t.Fatal("verifier did not match its own challenge")
	}
	if VerifyChallenge("other", ch) {
		t.Fatal("wrong verifier matched challenge")
	}
}

func TestCapability(t *testing.T) {
	s := NewSigner([]byte("secret"))
	now := time.Unix(1_700_000_000, 0)
	cap, err := s.SignCapability(Capability{Subject: "u1", Resource: "blob1", Op: "put", Expires: now.Add(time.Minute).Unix()})
	if err != nil {
		t.Fatalf("sign capability: %v", err)
	}
	c, err := s.VerifyCapability(cap, now)
	if err != nil || c.Subject != "u1" || c.Resource != "blob1" || c.Op != "put" {
		t.Fatalf("verify capability: %v %+v", err, c)
	}
	// Expired.
	if _, err := s.VerifyCapability(cap, now.Add(2*time.Minute)); err != ErrCapabilityInvalid {
		t.Fatalf("expired capability: got %v", err)
	}
	// A session token must not verify as a capability.
	tok, _ := s.Sign(Claims{Subject: "u1", Expires: now.Add(time.Hour).Unix()})
	if _, err := s.VerifyCapability(tok, now); err != ErrCapabilityInvalid {
		t.Fatalf("session token accepted as capability: %v", err)
	}
}
