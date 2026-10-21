-- Preserve v0.4.0 destination IDs, encrypted scopes, selections and history in place.
ALTER TABLE chat_connections ADD COLUMN provider TEXT NOT NULL DEFAULT 'slack' CHECK(provider IN ('slack','teams'));
ALTER TABLE chat_connections ADD COLUMN container_id TEXT REFERENCES containers(id);
DROP INDEX chat_connections_workspace_live_idx;
CREATE INDEX chat_connections_workspace_state ON chat_connections(workspace_id,state);
CREATE INDEX chat_connections_container ON chat_connections(container_id);
