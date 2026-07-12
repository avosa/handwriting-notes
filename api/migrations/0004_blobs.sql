-- Encrypted attachment blobs. Like notes, the server holds only ciphertext it cannot read, keyed by
-- account and blob id. A transfer is authorised by a short-lived signed capability, not by a column
-- here, so there is nothing to store about who may read a blob — only the owner and the bytes.

CREATE TABLE IF NOT EXISTS blobs (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blob_id    TEXT NOT NULL,
    ciphertext BYTEA NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, blob_id)
);

INSERT INTO schema_migrations (version) VALUES (4)
ON CONFLICT (version) DO NOTHING;
