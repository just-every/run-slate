-- rer 0.2.69+ fences every import with a renewable lease. Base creates this
-- private bookkeeping table on first use; installing it here keeps that DDL out
-- of erasure and transfer requests. Exact Base definition (import-lease.mjs).
CREATE TABLE IF NOT EXISTS rer_portability_import_leases (
    job TEXT PRIMARY KEY REFERENCES rer_portability_jobs(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL, holder TEXT
  );
