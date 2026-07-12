package api

import (
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// A token-bucket rate limiter, per client. Each client refills at a steady rate up to a burst, so a
// normal session never trips it but a flood or a brute-force run is throttled with a 429. It is a few
// floats per client in a map — cheap enough to run in front of every request without a store.
type limiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
	rate    float64 // tokens added per second
	burst   float64 // most tokens a client can bank
}

type bucket struct {
	tokens float64
	last   time.Time
}

func newLimiter(rate, burst float64) *limiter {
	return &limiter{buckets: map[string]*bucket{}, rate: rate, burst: burst}
}

// allow reports whether a client may make one more request now, spending a token if so.
func (l *limiter) allow(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	b := l.buckets[key]
	if b == nil {
		b = &bucket{tokens: l.burst, last: now}
		l.buckets[key] = b
	}
	// Refill for the time elapsed, capped at the burst.
	b.tokens += now.Sub(b.last).Seconds() * l.rate
	if b.tokens > l.burst {
		b.tokens = l.burst
	}
	b.last = now
	if b.tokens >= 1 {
		b.tokens--
		return true
	}
	return false
}

// middleware throttles by client address. A refused request gets a 429 and a Retry-After hint. A rate
// of zero or less turns throttling off, which is the switch tests and an internal deployment behind
// their own limiter use.
func (l *limiter) middleware(next http.Handler) http.Handler {
	if l.rate <= 0 {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !l.allow(clientIP(r), time.Now()) {
			w.Header().Set("Retry-After", strconv.Itoa(int(1/l.rate)+1))
			writeError(w, http.StatusTooManyRequests, "too many requests, slow down")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// clientIP is the address a request is throttled by. Behind a trusted proxy the first X-Forwarded-For
// entry is the real client; with no proxy the connection's remote address is used. (Only trust the
// header when the platform sets it; a direct deployment should ignore it.)
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		first, _, _ := strings.Cut(xff, ",")
		return strings.TrimSpace(first)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
