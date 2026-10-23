CREATE TABLE webhook_subscriptions (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 member_id TEXT NOT NULL REFERENCES members(id),
 container_id TEXT REFERENCES containers(id),
 name TEXT NOT NULL,
 destination TEXT NOT NULL,
 credential_ciphertext TEXT,
 events_json TEXT NOT NULL,
 mode TEXT NOT NULL DEFAULT 'events' CHECK(mode IN ('events','audit')),
 state TEXT NOT NULL DEFAULT 'enabled' CHECK(state IN ('enabled','disabled','removed')),
 scan_sequence INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 last_used_at TEXT,
 disabled_at TEXT,
 disabled_reason TEXT,
 revision_id TEXT NOT NULL
);
CREATE TABLE webhook_events (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 event_id TEXT NOT NULL UNIQUE,
 workspace_id TEXT NOT NULL
);
INSERT INTO webhook_events(event_id,workspace_id) SELECT id,workspace_id FROM activity_entries ORDER BY rowid;
CREATE TRIGGER webhook_activity_insert AFTER INSERT ON activity_entries BEGIN
 INSERT INTO webhook_events(event_id,workspace_id) VALUES(NEW.id,NEW.workspace_id);
END;
CREATE TRIGGER webhook_activity_delete AFTER DELETE ON activity_entries BEGIN
 DELETE FROM webhook_events WHERE event_id=OLD.id;
END;
CREATE TABLE webhook_deliveries (
 id TEXT PRIMARY KEY,
 subscription_id TEXT NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
 event_id TEXT NOT NULL,
 event_sequence INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sent','withheld','failed')),
 attempt_count INTEGER NOT NULL DEFAULT 0,
 cycle_attempts INTEGER NOT NULL DEFAULT 0,
 last_timestamp INTEGER,
 replay_count INTEGER NOT NULL DEFAULT 0,
 first_attempt_at TEXT,
 next_attempt_at TEXT,
 created_at TEXT NOT NULL,
 completed_at TEXT,
 lease_id TEXT,
 lease_until TEXT,
 UNIQUE(subscription_id,event_id)
);
CREATE INDEX webhook_deliveries_due ON webhook_deliveries(state,next_attempt_at);
CREATE TABLE webhook_attempts (
 delivery_id TEXT NOT NULL REFERENCES webhook_deliveries(id) ON DELETE CASCADE,
 attempt INTEGER NOT NULL,
 started_at TEXT NOT NULL,
 status INTEGER,
 duration_ms INTEGER NOT NULL,
 response TEXT NOT NULL DEFAULT '',
 outcome TEXT NOT NULL,
 replay INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(delivery_id,attempt)
);
CREATE TRIGGER webhook_member_authority AFTER UPDATE OF status,role,member_kind ON members
WHEN NEW.status!='active' OR NEW.role!='owner' OR NEW.member_kind!='member'
BEGIN
 UPDATE webhook_subscriptions SET state='disabled',disabled_at=NEW.updated_at,disabled_reason='Acting owner is unavailable.' WHERE member_id=NEW.id AND state='enabled';
END;
