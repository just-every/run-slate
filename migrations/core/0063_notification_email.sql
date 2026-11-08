CREATE TABLE notification_delivery_preferences (
 member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 event TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('default','in-app','immediate','daily','weekly')),
 revision_id TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(member_id,event)
);
CREATE TABLE notification_email_settings (
 workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
 section_names INTEGER NOT NULL DEFAULT 0 CHECK(section_names IN (0,1))
);
-- These execution receipts and bearer capabilities are installation-local.
CREATE TABLE notification_email_deliveries (
 id TEXT PRIMARY KEY,
 member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 state TEXT NOT NULL CHECK(state IN ('sending','sent','held','cancelled')),
 created_at TEXT NOT NULL,
 sent_at TEXT,
 provider_message_id TEXT
);
CREATE TABLE notification_email_items (
 notification_id TEXT PRIMARY KEY REFERENCES notifications(id) ON DELETE CASCADE,
 member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 mode TEXT NOT NULL CHECK(mode IN ('immediate','daily','weekly')),
 preference_revision TEXT NOT NULL,
 due_at TEXT NOT NULL,
 bucket TEXT NOT NULL,
 delivery_id TEXT REFERENCES notification_email_deliveries(id) ON DELETE CASCADE,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sent','cancelled','held'))
);
CREATE INDEX notification_email_due ON notification_email_items(state,due_at,member_id);
CREATE TABLE notification_unsubscribe_tokens (
 token_hash TEXT PRIMARY KEY,
 member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 events_json TEXT NOT NULL,
 created_at TEXT NOT NULL
);
-- Counts and block references only, never copies of block or comment text.
CREATE TABLE notification_change_blocks (
 outbox_id TEXT NOT NULL REFERENCES notification_outbox(id) ON DELETE CASCADE,
 block_id TEXT NOT NULL,
 existed_before INTEGER NOT NULL,
 exists_after INTEGER NOT NULL,
 PRIMARY KEY(outbox_id,block_id)
);
