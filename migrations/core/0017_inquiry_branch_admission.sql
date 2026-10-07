-- Retain branch admission independently of a hypothesis's scientific status.
-- Existing hypotheses retain their data; no historical admission is invented.
ALTER TABLE intelligence_hypotheses ADD COLUMN state TEXT CHECK(state IN ('admitted','unavailable'));
ALTER TABLE intelligence_hypotheses ADD COLUMN reason TEXT;
ALTER TABLE intelligence_hypotheses ADD COLUMN parent_run_id TEXT;
ALTER TABLE intelligence_hypotheses ADD COLUMN attempted_at TEXT;
