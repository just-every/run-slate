CREATE TABLE provider_folder_policies (
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 provider TEXT NOT NULL CHECK(provider IN ('google-drive','sharepoint')),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 updated_by_member_id TEXT REFERENCES members(id),
 revision_id TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id,provider)
);
CREATE TABLE provider_folder_connections (
 id TEXT PRIMARY KEY NOT NULL,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 member_id TEXT NOT NULL REFERENCES members(id),
 provider TEXT NOT NULL CHECK(provider IN ('google-drive','sharepoint')),
 principal_id TEXT NOT NULL,
 label TEXT NOT NULL,
 drive_id TEXT,
 credential_ciphertext TEXT,
 state TEXT NOT NULL CHECK(state IN ('connected','disconnected')),
 revision_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX provider_folder_connections_member ON provider_folder_connections(workspace_id,member_id);
CREATE TABLE provider_folder_runs (
 id TEXT PRIMARY KEY NOT NULL,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 actor_id TEXT NOT NULL REFERENCES members(id),
 connection_id TEXT NOT NULL REFERENCES provider_folder_connections(id),
 operation_key TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 source_folder_id TEXT NOT NULL,
 destination_page_id TEXT REFERENCES pages(id),
 state TEXT NOT NULL CHECK(state IN ('running','indexing','completed','failed')),
 report_json TEXT NOT NULL DEFAULT '{}',
 revision_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(workspace_id,actor_id,operation_key)
);
