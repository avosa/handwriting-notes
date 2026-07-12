// Command api is the backend service for the notes app. It is a thin relay: it authenticates people,
// syncs ciphertext it cannot read, and hands out short-lived URLs for encrypted blobs. This file is
// only the bootstrap — read the configuration, open the store, build the HTTP server, serve, and shut
// down cleanly when asked. Everything of substance lives behind the api and store packages.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/avosa/handwriting-notes/api/internal/api"
	"github.com/avosa/handwriting-notes/api/internal/config"
	"github.com/avosa/handwriting-notes/api/internal/store"
)

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg := config.Load()
	log := newLogger(cfg)

	// A context that cancels on interrupt or terminate, so both the store and the server wind down
	// together when the platform asks the process to stop.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	st, err := store.Open(ctx, cfg)
	if err != nil {
		return err
	}
	defer func() { _ = st.Close() }()

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           api.New(cfg, st, log).Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	// Serve in the background so the main goroutine can wait for the stop signal.
	serveErr := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", cfg.Addr, "env", cfg.Env)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
		}
	}()

	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
		log.Info("shutting down")
	}

	// Give in-flight requests a bounded moment to finish before the process exits.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}

// newLogger builds the structured logger: plain text for a readable local run, JSON in production so
// logs aggregate cleanly.
func newLogger(cfg config.Config) *slog.Logger {
	if cfg.IsProduction() {
		return slog.New(slog.NewJSONHandler(os.Stdout, nil))
	}
	return slog.New(slog.NewTextHandler(os.Stdout, nil))
}
