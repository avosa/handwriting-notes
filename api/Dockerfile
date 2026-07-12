# Build a tiny static binary and ship it on a scratch image, so the deployed service is only the
# binary and its TLS roots — a small attack surface and a small image that starts fast and scales
# cheaply.
FROM golang:1.26-alpine AS build
WORKDIR /src
# Modules first, so a dependency-free code change does not re-download anything.
COPY go.mod ./
RUN go mod download
COPY . .
# A fully static, stripped binary with no cgo, so it runs on scratch.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api .

FROM scratch
# The CA roots, so the service can make outbound TLS calls (OAuth, object storage).
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /out/api /api
EXPOSE 8080
ENV API_ADDR=":8080" API_ENV="production"
USER 65534:65534
ENTRYPOINT ["/api"]
