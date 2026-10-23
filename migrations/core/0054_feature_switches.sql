-- Missing overrides resolve to off; existing deployments retain every record.
CREATE TABLE workspace_feature_switches (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  switch_key TEXT NOT NULL CHECK (switch_key IN ('ai','ask','suggestions','agents','connectors','mcp','chat-ask')),
  enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
  changed_by_member_id TEXT REFERENCES members(id),
  changed_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, switch_key)
);
