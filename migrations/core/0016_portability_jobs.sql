-- Operational receipts survive workspace replacement; never portable authority.
CREATE TABLE portability_jobs (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('export','restore')),
 admission_workspace_id TEXT NOT NULL, admission_actor_id TEXT NOT NULL,
 operation_key TEXT NOT NULL, request_hash TEXT NOT NULL,
 status_workspace_id TEXT NOT NULL, status_actor_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('queued','running','completed','failed')),
 export_id TEXT, source_archive_key TEXT, planned_restore_id TEXT,
 source_ready INTEGER NOT NULL DEFAULT 0,
 counts_json TEXT NOT NULL DEFAULT '{}', report_json TEXT NOT NULL DEFAULT '{}',
 cleanup_json TEXT NOT NULL DEFAULT '[]',
 lease_id TEXT, lease_until TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 started_at TEXT, completed_at TEXT, expires_at TEXT NOT NULL,
 UNIQUE(admission_workspace_id,admission_actor_id,operation_key)
);
CREATE INDEX portability_jobs_retention ON portability_jobs(expires_at);
CREATE INDEX portability_jobs_owner ON portability_jobs(status_workspace_id,status_actor_id);
