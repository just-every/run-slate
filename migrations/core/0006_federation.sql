CREATE TABLE federation_connections (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, member_id TEXT NOT NULL, provider TEXT NOT NULL,
 account_id TEXT NOT NULL, credential_ciphertext TEXT, config_json TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('connected','revoked','needs-attention')), revision_id TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(workspace_id,member_id,provider,account_id)
);
CREATE TABLE federation_sources (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, connection_id TEXT NOT NULL, remote_id TEXT NOT NULL,
 published_revision_id TEXT, state TEXT NOT NULL DEFAULT 'active', refresh_id TEXT, revision_id TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(connection_id,remote_id)
);
CREATE TABLE federation_refreshes (
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL, state TEXT NOT NULL, expected_revision_id TEXT,
 error_code TEXT, created_at TEXT NOT NULL, completed_at TEXT
);
CREATE TABLE federation_revisions (
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL, remote_revision TEXT NOT NULL, title TEXT NOT NULL,
 content_hash TEXT NOT NULL, acl_json TEXT NOT NULL, observed_at TEXT NOT NULL, deleted_at TEXT,
 UNIQUE(source_id,remote_revision,content_hash)
);
CREATE TABLE federation_passages (
 id TEXT PRIMARY KEY, revision_id TEXT NOT NULL, ordinal INTEGER NOT NULL, content TEXT NOT NULL,
 UNIQUE(revision_id,ordinal)
);
CREATE INDEX federation_passages_revision ON federation_passages(revision_id,ordinal);
CREATE INDEX federation_sources_workspace ON federation_sources(workspace_id,state,id);
CREATE TABLE federation_imports (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, actor_id TEXT NOT NULL, operation_key TEXT NOT NULL,
 request_hash TEXT NOT NULL, archive_key TEXT NOT NULL, format TEXT NOT NULL, filename TEXT NOT NULL,
 state TEXT NOT NULL, plan_key TEXT, report_json TEXT NOT NULL DEFAULT '{}', counts_json TEXT NOT NULL DEFAULT '{}',
 revision_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(workspace_id,actor_id,operation_key)
);
CREATE TABLE federation_exports (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, actor_id TEXT NOT NULL, state TEXT NOT NULL,
 archive_key TEXT, report_json TEXT NOT NULL DEFAULT '{}', counts_json TEXT NOT NULL DEFAULT '{}',
 revision_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE federation_import_mappings (id TEXT PRIMARY KEY, import_job_id TEXT NOT NULL,source_kind TEXT NOT NULL,source_id TEXT NOT NULL,target_kind TEXT NOT NULL,target_id TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(import_job_id,source_kind,source_id));
CREATE TABLE federation_oauth_states (id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,member_id TEXT NOT NULL,provider TEXT NOT NULL,state_hash TEXT NOT NULL UNIQUE,verifier_ciphertext TEXT NOT NULL,source_url TEXT,expires_at TEXT NOT NULL,used_at TEXT,created_at TEXT NOT NULL);
ALTER TABLE federation_connections ADD COLUMN refresh_claim TEXT;

ALTER TABLE federation_revisions ADD COLUMN published_at TEXT;
ALTER TABLE federation_imports ADD COLUMN destination_page_id TEXT;
ALTER TABLE federation_imports ADD COLUMN expected_page_revision_id TEXT;
ALTER TABLE federation_imports ADD COLUMN destination_mode TEXT;
