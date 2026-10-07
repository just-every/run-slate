-- The canonical page position is nullable (0001). Preserve that exact prior value
-- so first-run and imported root pages can be archived and restored losslessly.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE content_archive_locations_nullable (
 page_id TEXT PRIMARY KEY REFERENCES pages(id),
 prior_parent_id TEXT,
 prior_container_id TEXT NOT NULL,
 prior_position TEXT,
 prior_lifecycle TEXT NOT NULL,
 action TEXT NOT NULL,
 actor_member_id TEXT NOT NULL,
 reason TEXT,
 occurred_at TEXT NOT NULL
);
INSERT INTO content_archive_locations_nullable
 SELECT page_id,prior_parent_id,prior_container_id,prior_position,prior_lifecycle,action,actor_member_id,reason,occurred_at
 FROM content_archive_locations;
DROP TABLE content_archive_locations;
ALTER TABLE content_archive_locations_nullable RENAME TO content_archive_locations;
