-- STAT-007: per-container nightly verification rules that flag or unverify, never verify.
-- A rule's action is fixed by its kind; "verify" can never be stored.
CREATE TABLE verification_rules (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  container_id TEXT NOT NULL REFERENCES containers(id),
  kind TEXT NOT NULL CHECK (kind IN ('cited-changed', 'no-owner', 'unviewed')),
  action TEXT NOT NULL CHECK (action IN ('unverify', 'flag')),
  days INTEGER CHECK (days IS NULL OR days BETWEEN 1 AND 3650),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  -- A rule runs only on UTC nights that start after it was turned on.
  enabled_at TEXT,
  updated_by_member_id TEXT REFERENCES members(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  UNIQUE (container_id, kind),
  CHECK ((action = 'unverify') = (kind = 'cited-changed'))
);
-- One durable receipt per rule and UTC night: concurrent invocations and restarts run it once.
CREATE TABLE verification_rule_runs (
  rule_id TEXT NOT NULL REFERENCES verification_rules(id),
  night TEXT NOT NULL,
  unverified INTEGER NOT NULL DEFAULT 0,
  flagged INTEGER NOT NULL DEFAULT 0,
  cleared INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (rule_id, night)
);
-- A flag is a visible marker, never verification. It is deleted when its condition clears;
-- a dismissed flag stays dismissed while the condition still holds.
CREATE TABLE verification_rule_flags (
  rule_id TEXT NOT NULL REFERENCES verification_rules(id),
  page_id TEXT NOT NULL REFERENCES pages(id),
  reason_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(reason_json)),
  flagged_at TEXT NOT NULL,
  dismissed_at TEXT,
  dismissed_by_member_id TEXT REFERENCES members(id),
  PRIMARY KEY (rule_id, page_id)
);
CREATE INDEX verification_rule_flags_page ON verification_rule_flags(page_id);
