-- CONT-010. A post is a page with a dated, attributed place in its container's
-- blog; every page clause still applies through pages(id). An imported post
-- keeps its source date, and its source author's name when no member maps.
CREATE TABLE blog_posts (
 page_id TEXT PRIMARY KEY NOT NULL REFERENCES pages(id),
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 posted_at TEXT NOT NULL,
 author_member_id TEXT REFERENCES members(id),
 author_name TEXT,
 created_at TEXT NOT NULL
);
CREATE INDEX blog_posts_feed ON blog_posts(workspace_id,posted_at,page_id);
-- Imported posts are native import rows; writes advance the undo fence like page_labels.
CREATE TRIGGER import_native_blog_posts_insert AFTER INSERT ON blog_posts BEGIN INSERT INTO import_native_epoch(id,revision,seal) VALUES(1,1,NULL) ON CONFLICT(id) DO UPDATE SET revision=revision+1,seal=NULL; END;
CREATE TRIGGER import_native_blog_posts_update AFTER UPDATE ON blog_posts BEGIN INSERT INTO import_native_epoch(id,revision,seal) VALUES(1,1,NULL) ON CONFLICT(id) DO UPDATE SET revision=revision+1,seal=NULL; END;
CREATE TRIGGER import_native_blog_posts_delete AFTER DELETE ON blog_posts BEGIN INSERT INTO import_native_epoch(id,revision,seal) VALUES(1,1,NULL) ON CONFLICT(id) DO UPDATE SET revision=revision+1,seal=NULL; END;
