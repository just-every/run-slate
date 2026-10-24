-- Optional profile fields and deliberate expertise visibility choices; existing members need no backfill.
CREATE TABLE member_profiles (
 member_id TEXT PRIMARY KEY NOT NULL REFERENCES members(id),
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 title TEXT NOT NULL DEFAULT '', team TEXT NOT NULL DEFAULT '',
 manager_member_id TEXT REFERENCES members(id), timezone TEXT NOT NULL DEFAULT 'UTC',
 revision_id TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX member_profiles_workspace ON member_profiles(workspace_id);
CREATE TABLE member_expertise_overrides (
 member_id TEXT NOT NULL REFERENCES members(id), tag_key TEXT NOT NULL,
 label TEXT NOT NULL, custom INTEGER NOT NULL CHECK(custom IN (0,1)), hidden INTEGER NOT NULL CHECK(hidden IN (0,1)),
 PRIMARY KEY(member_id,tag_key)
);
