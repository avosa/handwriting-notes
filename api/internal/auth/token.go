package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// TokenType tells an access token from a refresh token, so one can never be used where the other is
// meant — a refresh token cannot call the API, and an access token cannot mint new tokens.
type TokenType string

const (
	AccessToken  TokenType = "access"
	RefreshToken TokenType = "refresh"
)

// Token lifetimes. The access token is short so a leaked one is soon useless; the refresh token lives
// longer but is single-use and rotated on every refresh, so a stolen one is detectable and revocable.
const (
	AccessTTL  = 15 * time.Minute
	RefreshTTL = 30 * 24 * time.Hour
)

// Claims are what a token asserts: who it is for, what kind it is, when it was issued and expires, and
// a unique id so a refresh token can be tracked and revoked.
type Claims struct {
	Subject  string    `json:"sub"`
	Type     TokenType `json:"typ"`
	ID       string    `json:"jti"`
	IssuedAt int64     `json:"iat"`
	Expires  int64     `json:"exp"`
}

var (
	ErrTokenInvalid = errors.New("token invalid")
	ErrTokenExpired = errors.New("token expired")
)

// Signer mints and checks tokens with an HMAC secret. The token is the base64url of its claims and an
// HMAC-SHA256 over them — a compact, stateless bearer token that needs no database read to validate,
// which keeps the hot path a pure CPU check.
type Signer struct {
	secret []byte
}

// NewSigner returns a Signer over the given secret; the secret must be kept private to the server.
func NewSigner(secret []byte) *Signer { return &Signer{secret: secret} }

// Sign encodes and signs the claims into a token string.
func (s *Signer) Sign(c Claims) (string, error) {
	payload, err := json.Marshal(c)
	if err != nil {
		return "", err
	}
	body := b64.EncodeToString(payload)
	return body + "." + b64.EncodeToString(s.mac(body)), nil
}

// Verify checks a token's signature and expiry and returns its claims. The signature is compared in
// constant time; an expired but otherwise valid token is reported distinctly so the caller can tell a
// forgery from a token that simply needs refreshing.
func (s *Signer) Verify(token string, now time.Time) (Claims, error) {
	var c Claims
	body, sigStr, ok := strings.Cut(token, ".")
	if !ok {
		return c, ErrTokenInvalid
	}
	sig, err := b64.DecodeString(sigStr)
	if err != nil || subtle.ConstantTimeCompare(sig, s.mac(body)) != 1 {
		return c, ErrTokenInvalid
	}
	payload, err := b64.DecodeString(body)
	if err != nil {
		return c, ErrTokenInvalid
	}
	if err := json.Unmarshal(payload, &c); err != nil {
		return c, ErrTokenInvalid
	}
	if now.Unix() >= c.Expires {
		return c, ErrTokenExpired
	}
	return c, nil
}

func (s *Signer) mac(body string) []byte {
	m := hmac.New(sha256.New, s.secret)
	m.Write([]byte(body))
	return m.Sum(nil)
}

// Pair is an access token and the refresh token that renews it, with the refresh token's id so the
// server can record it for rotation.
type Pair struct {
	Access       string
	Refresh      string
	RefreshID    string
	AccessExpiry time.Time
}

// Issue mints a fresh access and refresh token for a subject at time now. The refresh token carries a
// random id the caller stores, so a later refresh can rotate it and revoke the old one.
func (s *Signer) Issue(subject string, now time.Time) (Pair, error) {
	accessID, err := RandomID(16)
	if err != nil {
		return Pair{}, err
	}
	refreshID, err := RandomID(16)
	if err != nil {
		return Pair{}, err
	}
	accessExp := now.Add(AccessTTL)
	access, err := s.Sign(Claims{Subject: subject, Type: AccessToken, ID: accessID, IssuedAt: now.Unix(), Expires: accessExp.Unix()})
	if err != nil {
		return Pair{}, err
	}
	refresh, err := s.Sign(Claims{Subject: subject, Type: RefreshToken, ID: refreshID, IssuedAt: now.Unix(), Expires: now.Add(RefreshTTL).Unix()})
	if err != nil {
		return Pair{}, err
	}
	return Pair{Access: access, Refresh: refresh, RefreshID: refreshID, AccessExpiry: accessExp}, nil
}
