-- Explicit assignments retain acknowledgments, never passive readership measurements.
CREATE TABLE required_readings (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 page_id TEXT NOT NULL REFERENCES pages(id),
 group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
 sender_member_id TEXT REFERENCES members(id),
 reminder_days INTEGER NOT NULL CHECK(reminder_days BETWEEN 1 AND 365),
 due_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 cancelled_at TEXT
);
CREATE TABLE required_reading_members (
 reading_id TEXT NOT NULL REFERENCES required_readings(id) ON DELETE CASCADE,
 member_id TEXT NOT NULL REFERENCES members(id),
 eligible INTEGER NOT NULL CHECK(eligible IN (0,1)),
 acknowledged_at TEXT,
 reminded_at TEXT,
 PRIMARY KEY(reading_id,member_id)
);
CREATE INDEX required_readings_due ON required_readings(due_at) WHERE cancelled_at IS NULL;
CREATE INDEX required_reading_member ON required_reading_members(member_id,reading_id);
