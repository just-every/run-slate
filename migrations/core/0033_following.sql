-- A disabled row records an explicit unwatch; later authoring must not undo it.
ALTER TABLE page_watches ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1));
CREATE INDEX page_watches_page_enabled ON page_watches(page_id,enabled,member_id);
-- Recover explicit stops recorded by older clients, including ones a later
-- implicit comment watch accidentally overwrote before this migration.
INSERT INTO page_watches(member_id,page_id,created_at,enabled)
 SELECT latest.member_id,latest.page_id,latest.created_at,0 FROM (
  SELECT member_id,workspace_id,json_extract(body_json,'$.pageId') AS page_id,created_at,
   json_extract(body_json,'$.enabled') AS enabled,
   ROW_NUMBER() OVER(PARTITION BY member_id,json_extract(body_json,'$.pageId') ORDER BY created_at DESC,id DESC) AS ordinal
  FROM discovery_revisions WHERE entity_kind='watch' AND json_type(body_json,'$.enabled') IN ('true','false')
 ) latest JOIN pages p ON p.id=latest.page_id AND p.workspace_id=latest.workspace_id AND p.deleted_at IS NULL
 WHERE latest.ordinal=1 AND latest.enabled=0
 ON CONFLICT(member_id,page_id) DO UPDATE SET enabled=0;
CREATE TABLE container_watches (
 member_id TEXT NOT NULL REFERENCES members(id),container_id TEXT NOT NULL REFERENCES containers(id),
 created_at TEXT NOT NULL,PRIMARY KEY(member_id,container_id)
);
CREATE INDEX container_watches_container ON container_watches(container_id,member_id);
-- An editing session ends after five minutes without a saved edit by this author.
-- The session identity survives delivery, retries and worker restarts.
CREATE TABLE watch_edit_sessions (
 page_id TEXT NOT NULL REFERENCES pages(id),actor_member_id TEXT NOT NULL REFERENCES members(id),
 session_id TEXT NOT NULL,last_edit_at TEXT NOT NULL,PRIMARY KEY(page_id,actor_member_id)
);
