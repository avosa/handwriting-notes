// Package config reads the service's settings from the environment. There is no config file: a
// twelve-factor service takes everything from the environment, so the same binary runs on a laptop
// and in production with nothing to mount.
package config

import (
	"os"
	"strconv"
	"time"
)

// Config is the whole of the service's settings. It is small on purpose — the server is a thin
// relay, so there is little to configure beyond where to listen and how long to wait.
type Config struct {
	// Addr is the TCP address the HTTP server listens on, e.g. ":8080".
	Addr string
	// DatabaseURL is the connection string for the store. Empty means the in-memory store, which is
	// used for local runs and tests; a real deployment sets a database URL.
	DatabaseURL string
	// ShutdownTimeout bounds how long in-flight requests have to finish when the server is stopping.
	ShutdownTimeout time.Duration
	// Env names the environment ("development" or "production"), which decides how much detail an
	// error reveals and whether extra developer conveniences are on.
	Env string
	// TokenSecret is the HMAC key session tokens are signed with. It must be set and kept private in
	// production; a local run without one gets a fresh random key each start (which logs everyone out
	// on restart, which is fine for development).
	TokenSecret string
	// RatePerSec and RateBurst bound how fast one client may call the API: a steady rate with a burst
	// on top, so a normal session never notices but a flood or a brute-force is throttled.
	RatePerSec float64
	RateBurst  float64
}

// Load reads the configuration from the environment, applying sensible defaults so the service runs
// with nothing set.
func Load() Config {
	return Config{
		Addr:            env("API_ADDR", ":8080"),
		DatabaseURL:     env("DATABASE_URL", ""),
		ShutdownTimeout: envDuration("API_SHUTDOWN_TIMEOUT", 15*time.Second),
		Env:             env("API_ENV", "development"),
		TokenSecret:     env("API_TOKEN_SECRET", ""),
		RatePerSec:      envFloat("API_RATE_PER_SEC", 20),
		RateBurst:       envFloat("API_RATE_BURST", 40),
	}
}

// IsProduction reports whether the service is running in a production environment.
func (c Config) IsProduction() bool { return c.Env == "production" }

func env(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func envFloat(key string, fallback float64) float64 {
	if v, ok := os.LookupEnv(key); ok {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return fallback
}

func envDuration(key string, fallback time.Duration) time.Duration {
	if v, ok := os.LookupEnv(key); ok {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
		if secs, err := strconv.Atoi(v); err == nil {
			return time.Duration(secs) * time.Second
		}
	}
	return fallback
}
