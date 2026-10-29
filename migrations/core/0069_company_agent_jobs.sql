-- Durable native invocation, retaining the originating identity without bearer tokens.
CREATE TABLE slate_agent_jobs (
 id TEXT PRIMARY KEY,
 person_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 agent_id TEXT NOT NULL,
 public_key TEXT NOT NULL,
 request_json TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','running','complete')),
 result_json TEXT,
 lease_until INTEGER,
 lease_id TEXT,
 created_at TEXT NOT NULL,
 completed_at TEXT,
 UNIQUE(agent_id,public_key)
);
