-- The migration ledger: which schema versions have been applied. Every other migration records its
-- version here, so a database can be brought to a known schema and checked against the code.

CREATE TABLE IF NOT EXISTS schema_migrations (
    version     INTEGER PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version) VALUES (1)
ON CONFLICT (version) DO NOTHING;
