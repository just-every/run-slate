CREATE TABLE content_page_opens (member_id TEXT NOT NULL REFERENCES members(id), page_id TEXT NOT NULL REFERENCES pages(id), revision_id TEXT NOT NULL, opened_at TEXT NOT NULL, PRIMARY KEY(member_id,page_id,revision_id));
CREATE TABLE content_tree_expansion (member_id TEXT NOT NULL REFERENCES members(id), page_id TEXT NOT NULL REFERENCES pages(id), expanded INTEGER NOT NULL CHECK(expanded IN(0,1)), updated_at TEXT NOT NULL, PRIMARY KEY(member_id,page_id));
CREATE TABLE content_schedules (page_id TEXT PRIMARY KEY REFERENCES pages(id), publish_at TEXT NOT NULL, actor_member_id TEXT NOT NULL REFERENCES members(id), expected_revision_id TEXT NOT NULL, operation_key TEXT NOT NULL, label TEXT, state TEXT NOT NULL CHECK(state IN('scheduled','cancelled','published','failed')), failure TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE content_archive_locations (page_id TEXT PRIMARY KEY REFERENCES pages(id), prior_parent_id TEXT, prior_container_id TEXT NOT NULL, prior_position TEXT NOT NULL, prior_lifecycle TEXT NOT NULL, action TEXT NOT NULL, actor_member_id TEXT NOT NULL, reason TEXT, occurred_at TEXT NOT NULL);
CREATE TABLE content_suggestions (id TEXT PRIMARY KEY, page_id TEXT NOT NULL REFERENCES pages(id), revision_id TEXT NOT NULL, proposed_by_member_id TEXT NOT NULL REFERENCES members(id), patch_json TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN('pending','accepted','rejected')), decided_by_member_id TEXT, decided_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE content_tombstones (page_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, deleted_at TEXT NOT NULL);
CREATE TABLE content_presence (page_id TEXT NOT NULL REFERENCES pages(id), member_id TEXT NOT NULL REFERENCES members(id), session_id TEXT NOT NULL, cursor_json TEXT, expires_at TEXT NOT NULL, PRIMARY KEY(page_id,member_id,session_id));
CREATE TABLE content_media_cleanup (storage_key TEXT PRIMARY KEY, created_at TEXT NOT NULL);
CREATE TABLE content_events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, page_id TEXT NOT NULL REFERENCES pages(id), revision_id TEXT NOT NULL, actor_member_id TEXT NOT NULL, kind TEXT NOT NULL, detail_json TEXT NOT NULL, created_at TEXT NOT NULL);
ALTER TABLE comment_threads ADD COLUMN orphaned INTEGER NOT NULL DEFAULT 0;
-- Preserve every legacy event before collapsing equivalent active reactions.
CREATE TABLE content_legacy_reactions AS SELECT * FROM reactions WHERE 0;
INSERT INTO content_legacy_reactions SELECT r.* FROM reactions r WHERE
 (r.comment_id IS NULL AND EXISTS (SELECT 1 FROM reactions x WHERE x.page_id=r.page_id AND x.comment_id IS NULL AND x.member_id=r.member_id AND x.emoji=r.emoji AND x.id<r.id)) OR
 (r.page_id IS NULL AND EXISTS (SELECT 1 FROM reactions x WHERE x.comment_id=r.comment_id AND x.page_id IS NULL AND x.member_id=r.member_id AND x.emoji=r.emoji AND x.id<r.id));
DELETE FROM reactions WHERE id IN (SELECT id FROM content_legacy_reactions);
CREATE UNIQUE INDEX content_reaction_page_unique ON reactions(page_id,member_id,emoji) WHERE comment_id IS NULL;
CREATE UNIQUE INDEX content_reaction_comment_unique ON reactions(comment_id,member_id,emoji) WHERE page_id IS NULL;
INSERT OR IGNORE INTO status_entries(id,workspace_id,key,label,color,requires_verification,created_at,updated_at)
SELECT '0000000000'||upper(hex(randomblob(8))),w.id,d.key,d.label,d.color,d.verification,w.created_at,w.updated_at FROM workspaces w CROSS JOIN (
 SELECT 'rough-draft' AS key,'Rough draft' AS label,'#8b9098' AS color,0 AS verification UNION ALL SELECT 'in-progress','In progress','#4488cc',0 UNION ALL SELECT 'ready-for-review','Ready for review','#cc9900',0 UNION ALL SELECT 'verified','Verified','#228855',1
) d;

-- Publication is a fact, never inferred from chronology or the current draft pointer.
CREATE TABLE content_published_revisions (page_id TEXT NOT NULL REFERENCES pages(id), revision_id TEXT NOT NULL, PRIMARY KEY(page_id,revision_id));
INSERT INTO content_published_revisions SELECT id,published_revision_id FROM pages WHERE published_revision_id IS NOT NULL AND lifecycle IN ('live','live-with-unpublished-changes','archived');
CREATE TRIGGER content_publication_insert AFTER INSERT ON pages WHEN NEW.published_revision_id IS NOT NULL AND NEW.lifecycle IN ('live','live-with-unpublished-changes') BEGIN
 INSERT OR IGNORE INTO content_published_revisions VALUES (NEW.id,NEW.published_revision_id);
END;
CREATE TRIGGER content_publication_update AFTER UPDATE OF published_revision_id,lifecycle ON pages WHEN NEW.published_revision_id IS NOT NULL AND NEW.lifecycle IN ('live','live-with-unpublished-changes') BEGIN
 INSERT OR IGNORE INTO content_published_revisions VALUES (NEW.id,NEW.published_revision_id);
END;
