# api

The backend service for the notes app. It is a thin relay: it authenticates people, syncs ciphertext
it cannot read, and hands out short-lived URLs for encrypted blobs. The client does the rendering,
editing, search, on-device inference, and every BYO-key call; the server does only what a server
alone can do.

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

| Variable                | Default       | Meaning                                                   |
| ----------------------- | ------------- | --------------------------------------------------------- |
| `API_ADDR`              | `:8080`       | Address the HTTP server listens on                        |
| `API_ENV`               | `development` | `production` switches logs to JSON and hides error detail |
| `DATABASE_URL`          | *(empty)*     | Store connection string; empty uses in-memory             |
| `API_TOKEN_SECRET`      | *(empty)*     | HMAC key for session tokens; required in production       |
| `API_RATE_PER_SEC`      | `20`          | Per-client request rate; `0` turns throttling off         |
| `API_RATE_BURST`        | `40`          | Per-client burst on top of the rate                       |
| `API_SHUTDOWN_TIMEOUT`  | `15s`         | How long in-flight requests get to finish on stop         |

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
│  ├─ auth/                # password hashing, session tokens, PKCE, capabilities
│  ├─ store/               # the persistence seam (interface + in-memory)
│  └─ api/                 # HTTP router, middleware, handlers
└─ migrations/             # SQL schema migrations
```
