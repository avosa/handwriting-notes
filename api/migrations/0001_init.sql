-- The first migration establishes only the migration ledger itself. The service is a thin relay and
-- has no persisted state until accounts arrive, so there are no domain tables here yet — each later
-- feature adds its own migration. Keeping the ledger from the start means a real database can be
-- stood up and versioned before the first table is written.

CREATE TABLE IF NOT EXISTS schema_migrations (
    version     INTEGER PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version) VALUES (1)
ON CONFLICT (version) DO NOTHING;
