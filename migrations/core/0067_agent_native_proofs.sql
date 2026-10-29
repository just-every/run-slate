CREATE TABLE slate_agent_native_proofs (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  arguments_hash TEXT,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
