-- Tasks remain body blocks. Keep their original author independently of later edits/restores.
CREATE TABLE task_origins (
 block_id TEXT PRIMARY KEY, page_id TEXT NOT NULL REFERENCES pages(id),
 member_id TEXT REFERENCES members(id), created_at TEXT NOT NULL
);
INSERT INTO task_origins(block_id,page_id,member_id,created_at)
 SELECT b.id,b.page_id,
 (SELECT r.author_member_id FROM page_revisions r,json_each(r.body_json) j WHERE r.page_id=b.page_id AND json_extract(j.value,'$.id')=b.id ORDER BY r.created_at,r.id LIMIT 1),
 b.created_at FROM page_blocks b WHERE b.block_type='task';
CREATE TABLE reminders (
 id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),member_id TEXT NOT NULL REFERENCES members(id),
 page_id TEXT NOT NULL REFERENCES pages(id),block_id TEXT,kind TEXT NOT NULL CHECK(kind IN ('personal','task-due')),
 date TEXT NOT NULL,time TEXT NOT NULL,timezone TEXT NOT NULL,offset_minutes INTEGER NOT NULL DEFAULT 0,due_at TEXT NOT NULL,
 revision_id TEXT NOT NULL,created_at TEXT NOT NULL,delivered_at TEXT,cancelled_at TEXT
);
CREATE INDEX reminders_due ON reminders(workspace_id,due_at) WHERE delivered_at IS NULL AND cancelled_at IS NULL;
CREATE INDEX reminders_member ON reminders(member_id,created_at,id);
