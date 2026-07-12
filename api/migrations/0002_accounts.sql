-- Accounts and the refresh tokens each account currently trusts. The service is server-authoritative
-- for identity: an account is one row here, and a session is a trusted refresh token id that is
-- rotated on every use, so a stolen refresh token is single-use and revocable. Note data is not here —
-- it syncs as ciphertext under its own migration — so this table holds only what identity needs.

CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per refresh token the server trusts. Deleting a row revokes that session; rotation deletes
-- the old id and inserts the new one in the same transaction. Expired rows can be swept on a timer.
CREATE TABLE IF NOT EXISTS refresh_tokens (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_id   TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, token_id)
);

CREATE INDEX IF NOT EXISTS refresh_tokens_expires_idx ON refresh_tokens (expires_at);

INSERT INTO schema_migrations (version) VALUES (2)
ON CONFLICT (version) DO NOTHING;
