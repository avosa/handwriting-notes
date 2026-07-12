-- End-to-end-encrypted note sync. The server stores ciphertext it cannot read, one row per note per
-- account, plus a per-account rev counter that both versions a note and orders the change feed. There
-- is deliberately no column that reveals a note's content, title, or structure — only opaque bytes,
-- when it changed, and whether it is a tombstone.

CREATE TABLE IF NOT EXISTS notes (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_id    TEXT NOT NULL,
    ciphertext BYTEA NOT NULL DEFAULT '',
    rev        BIGINT NOT NULL,
    deleted    BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, note_id)
);

-- The pull side reads a user's rows above a cursor in rev order, so index by (user, rev).
CREATE INDEX IF NOT EXISTS notes_user_rev_idx ON notes (user_id, rev);

-- The monotonic rev handed out per account. A write bumps last_rev and stamps the note with it in one
-- transaction, so revs are unique and gap-free per account.
CREATE TABLE IF NOT EXISTS sync_state (
    user_id  TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_rev BIGINT NOT NULL DEFAULT 0
);

INSERT INTO schema_migrations (version) VALUES (3)
ON CONFLICT (version) DO NOTHING;
