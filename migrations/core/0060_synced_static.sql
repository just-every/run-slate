-- Restricted static copies retain content separately from page bodies and search indexes.
CREATE TABLE synced_static_content (
 id TEXT PRIMARY KEY NOT NULL,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 page_id TEXT NOT NULL REFERENCES pages(id),
 block_id TEXT NOT NULL,
 text_json TEXT NOT NULL,
 source_title TEXT NOT NULL,
 reader_ids_json TEXT NOT NULL,
 anonymous_allowed INTEGER NOT NULL CHECK (anonymous_allowed IN (0,1)),
 created_at TEXT NOT NULL
);
CREATE INDEX synced_static_page ON synced_static_content(page_id);
-- A restored historical reference never reconnects after its source was removed.
CREATE TABLE synced_deleted_references (
 copy_page_id TEXT NOT NULL REFERENCES pages(id),
 copy_block_id TEXT NOT NULL,
 source_page_id TEXT NOT NULL,
 source_block_id TEXT NOT NULL,
 PRIMARY KEY(copy_page_id,copy_block_id,source_page_id,source_block_id)
);
