-- Personal state has its own immutable history; originating product records stay owned by their features.
CREATE TABLE discovery_revisions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), member_id TEXT NOT NULL REFERENCES members(id), entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL, body_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE discovery_preferences (member_id TEXT PRIMARY KEY REFERENCES members(id), workspace_id TEXT NOT NULL REFERENCES workspaces(id), value_json TEXT NOT NULL, revision_id TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE saved_searches (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), member_id TEXT NOT NULL REFERENCES members(id), name TEXT NOT NULL, query_json TEXT NOT NULL, revision_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE discovery_snapshots (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), member_id TEXT NOT NULL REFERENCES members(id), query_hash TEXT NOT NULL, ids_json TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE INDEX discovery_snapshots_expiry ON discovery_snapshots(expires_at);
CREATE TABLE notification_outbox (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), actor_member_id TEXT REFERENCES members(id), event TEXT NOT NULL, page_id TEXT, container_id TEXT, comment_id TEXT, recipients_json TEXT NOT NULL, watched_recipients_json TEXT NOT NULL DEFAULT '[]', detail_json TEXT NOT NULL, created_at TEXT NOT NULL, processed_at TEXT);
CREATE INDEX notification_outbox_pending ON notification_outbox(processed_at,created_at);
ALTER TABLE notifications ADD COLUMN outbox_id TEXT;
ALTER TABLE notifications ADD COLUMN source_container_id TEXT;
ALTER TABLE notifications ADD COLUMN audience TEXT NOT NULL DEFAULT 'direct';
CREATE UNIQUE INDEX notifications_event_recipient ON notifications(outbox_id,recipient_member_id);
CREATE TABLE chat_deliveries (id TEXT PRIMARY KEY, connection_id TEXT NOT NULL REFERENCES chat_connections(id), outbox_id TEXT NOT NULL REFERENCES notification_outbox(id), state TEXT NOT NULL CHECK(state IN ('pending','dispatching','delivered','failed','uncertain','cancelled')), attempts INTEGER NOT NULL DEFAULT 0, first_attempt_at TEXT, next_attempt_at TEXT, delivered_at TEXT, failure TEXT, provider_receipt TEXT, created_at TEXT NOT NULL, UNIQUE(connection_id,outbox_id));
ALTER TABLE chat_connections ADD COLUMN audience_member_ids_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE chat_connections ADD COLUMN revision_id TEXT;
CREATE INDEX chat_deliveries_pending ON chat_deliveries(state,next_attempt_at);

ALTER TABLE chat_connections ADD COLUMN source_connection_id TEXT;
ALTER TABLE chat_connections ADD COLUMN source_connection_revision_id TEXT;
