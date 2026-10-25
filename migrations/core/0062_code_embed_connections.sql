CREATE TABLE code_embed_connections (
 id TEXT PRIMARY KEY NOT NULL,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 member_id TEXT NOT NULL REFERENCES members(id),
 provider TEXT NOT NULL CHECK(provider IN ('github','gitlab')),
 principal_id TEXT NOT NULL,
 verified_email TEXT NOT NULL,
 label TEXT NOT NULL,
 credential_ciphertext TEXT,
 state TEXT NOT NULL CHECK(state IN ('connected','disconnected')),
 revision_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(workspace_id,member_id,provider)
);
