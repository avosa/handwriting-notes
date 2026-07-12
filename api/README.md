# api

The backend service for the notes app. It is a thin relay: it will authenticate people, sync
ciphertext it cannot read, and hand out short-lived URLs for encrypted blobs. The client keeps doing
the rendering, editing, search, on-device inference, and every BYO-key call; the server only does
what a server alone can do.

Written in Go with the standard library — no web framework — so the binary and the request path stay
lean.

## Run

```sh
make run          # starts on :8080 with the in-memory store
curl localhost:8080/health
# {"status":"ok","store":"ok"}
```

## Configuration

Everything comes from the environment; nothing is read from a file.

| Variable                | Default   | Meaning                                        |
| ----------------------- | --------- | ---------------------------------------------- |
| `API_ADDR`              | `:8080`   | Address the HTTP server listens on             |
| `API_ENV`               | `development` | `production` switches logs to JSON and hides error detail |
| `DATABASE_URL`          | *(empty)* | Store connection string; empty uses in-memory  |
| `API_SHUTDOWN_TIMEOUT`  | `15s`     | How long in-flight requests get to finish on stop |

## Develop

```sh
make check        # gofmt clean + go vet + go test — mirrors CI
make build        # a static, stripped binary in bin/api
make docker       # a scratch image with just the binary and TLS roots
```

## Layout

```
api/
├─ main.go                 # bootstrap: config, store, server, graceful shutdown
├─ internal/
│  ├─ config/              # settings from the environment
│  ├─ store/               # the persistence seam (interface + in-memory)
│  └─ api/                 # HTTP router, middleware, handlers
└─ migrations/             # SQL migrations, versioned from the start
```

## Status

Phase 6, first stand-up: the service, its configuration, the store seam, health checks, structured
logging, graceful shutdown, a container image, and the CI gate. Accounts, end-to-end-encrypted sync,
and blob storage land next, each a thin addition behind the store interface.
