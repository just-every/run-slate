-- DB-015: record templates (default field values and a body) and their optional calendar schedule.
-- timezone is the personal time zone of the member who last saved the schedule, captured when it was saved.
-- creator_member_id names that last saver (a re-save replaces it): the member the schedule runs as.
CREATE TABLE database_record_templates (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  database_id TEXT NOT NULL REFERENCES databases(id),
  name TEXT NOT NULL,
  record_title TEXT NOT NULL,
  values_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(values_json)),
  blocks_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(blocks_json)),
  recurrence_json TEXT CHECK (recurrence_json IS NULL OR json_valid(recurrence_json)),
  timezone TEXT,
  next_occurrence_at TEXT,
  creator_member_id TEXT NOT NULL REFERENCES members(id),
  paused_at TEXT,
  paused_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision_id TEXT NOT NULL
);
CREATE INDEX database_record_templates_database ON database_record_templates(database_id, name);
CREATE INDEX database_record_templates_due ON database_record_templates(workspace_id, next_occurrence_at) WHERE recurrence_json IS NOT NULL AND paused_at IS NULL;
-- One row per schedule occurrence, written in the same batch as its record: an occurrence can never create a second record.
CREATE TABLE database_record_occurrences (
  template_id TEXT NOT NULL REFERENCES database_record_templates(id),
  occurrence_at TEXT NOT NULL,
  record_page_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (template_id, occurrence_at)
);
