-- ADMIN-004: daily aggregate only. No member, session or reading identity is retained.
-- Empty container_scope denotes a workspace-wide search; these rows are owner-only.
CREATE TABLE analytics_no_result_searches (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  container_scope TEXT NOT NULL,
  query TEXT NOT NULL,
  day TEXT NOT NULL,
  searches INTEGER NOT NULL DEFAULT 1 CHECK(searches > 0),
  PRIMARY KEY(workspace_id, container_scope, query, day)
);
