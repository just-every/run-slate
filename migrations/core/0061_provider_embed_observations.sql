CREATE TABLE provider_embed_observations (
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 provider_host TEXT NOT NULL,
 deployment_origin TEXT NOT NULL,
 verdict TEXT NOT NULL CHECK(verdict IN ('embeddable','refuses')),
 observed_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id,provider_host)
);
