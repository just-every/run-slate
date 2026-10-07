CREATE TABLE structured_revisions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL, snapshot_json TEXT NOT NULL, actor_member_id TEXT NOT NULL REFERENCES members(id), created_at TEXT NOT NULL);
ALTER TABLE database_records ADD COLUMN revision_id TEXT;
UPDATE database_records SET revision_id=(SELECT revision_id FROM pages WHERE pages.id=database_records.page_id);
CREATE TABLE automation_jobs (id TEXT PRIMARY KEY, run_id TEXT NOT NULL UNIQUE REFERENCES automation_runs(id), event_key TEXT NOT NULL, rule_id TEXT NOT NULL REFERENCES automation_rules(id), payload_json TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'queued', lease_until TEXT, created_at TEXT NOT NULL, UNIQUE(rule_id,event_key));
CREATE TABLE automation_action_receipts (run_id TEXT NOT NULL REFERENCES automation_runs(id), action_index INTEGER NOT NULL, target_id TEXT NOT NULL, state TEXT NOT NULL, receipt_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(run_id,action_index,target_id));
CREATE TABLE automation_event_cursors (workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id), sequence INTEGER NOT NULL DEFAULT 0);
CREATE TABLE structured_page_fields (page_id TEXT PRIMARY KEY REFERENCES pages(id), fields_json TEXT NOT NULL);
