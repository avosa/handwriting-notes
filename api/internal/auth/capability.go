package auth

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// A capability is a short-lived, single-purpose grant: it names one account, one resource, and one
// operation, and expires soon. It is how an encrypted blob is uploaded or fetched without the account
// bearing its session token over the transfer — the URL itself carries the least privilege needed and
// nothing more. Capabilities are HMAC-signed like session tokens but domain-separated by a literal
// prefix in the signed body, so a session token can never be replayed as a capability or the reverse.

const capPrefix = "cap."

// Capability is what a signed grant asserts.
type Capability struct {
	Subject  string `json:"sub"`
	Resource string `json:"res"`
	Op       string `json:"op"`
	Expires  int64  `json:"exp"`
}

var ErrCapabilityInvalid = errors.New("capability invalid")

// SignCapability mints a signed grant string.
func (s *Signer) SignCapability(c Capability) (string, error) {
	payload, err := json.Marshal(c)
	if err != nil {
		return "", err
	}
	body := capPrefix + b64.EncodeToString(payload)
	return body + "." + b64.EncodeToString(s.mac(body)), nil
}

// VerifyCapability checks a grant's signature, prefix, and expiry, and returns it. A session token,
// which is signed without the capability prefix, fails the prefix and signature checks here.
func (s *Signer) VerifyCapability(token string, now time.Time) (Capability, error) {
	var c Capability
	// The body carries the "cap." prefix and its own "." separators, so split off the signature from
	// the right.
	i := strings.LastIndexByte(token, '.')
	if i < 0 {
		return c, ErrCapabilityInvalid
	}
	body, sigStr := token[:i], token[i+1:]
	if !strings.HasPrefix(body, capPrefix) {
		return c, ErrCapabilityInvalid
	}
	sig, err := b64.DecodeString(sigStr)
	if err != nil || subtle.ConstantTimeCompare(sig, s.mac(body)) != 1 {
		return c, ErrCapabilityInvalid
	}
	payload, err := b64.DecodeString(strings.TrimPrefix(body, capPrefix))
	if err != nil {
		return c, ErrCapabilityInvalid
	}
	if err := json.Unmarshal(payload, &c); err != nil {
		return c, ErrCapabilityInvalid
	}
	if now.Unix() >= c.Expires {
		return c, ErrCapabilityInvalid
	}
	return c, nil
}
