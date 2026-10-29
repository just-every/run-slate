-- Bind authentication handoffs to the original native client. Existing
-- handoffs expire and must be prepared again; they never gain a new client.
ALTER TABLE slate_agent_native_proofs ADD COLUMN client_id TEXT;
ALTER TABLE slate_agent_native_proofs ADD COLUMN proof_kind TEXT NOT NULL DEFAULT 'step_up';
DELETE FROM slate_agent_native_proofs;
ALTER TABLE comments ADD COLUMN agent_creator_json TEXT;
ALTER TABLE comments ADD COLUMN agent_editor_json TEXT;
ALTER TABLE comment_threads ADD COLUMN resolved_agent_json TEXT;
