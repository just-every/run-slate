-- Retain historical decision identities; only attached layers are unique per page.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE knowledge_decisions_next (
  id TEXT PRIMARY KEY NOT NULL,
  page_id TEXT NOT NULL REFERENCES pages(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  question TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '[]',
  outcome TEXT,
  rationale TEXT,
  owner_member_id TEXT REFERENCES members(id),
  decided_at TEXT,
  review_at TEXT,
  overdue_notified_at TEXT,
  state TEXT NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'accepted', 'superseded')),
  accepted_snapshot_json TEXT,
  superseded_by_decision_id TEXT REFERENCES knowledge_decisions_next(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  removed_at TEXT,
  removed_by_member_id TEXT REFERENCES members(id),
  accepted_revision_id TEXT
);
INSERT INTO knowledge_decisions_next (id,page_id,workspace_id,question,options_json,outcome,rationale,owner_member_id,decided_at,review_at,overdue_notified_at,state,accepted_snapshot_json,superseded_by_decision_id,created_at,updated_at,revision_id,accepted_revision_id) SELECT id,page_id,workspace_id,question,options_json,outcome,rationale,owner_member_id,decided_at,review_at,overdue_notified_at,state,accepted_snapshot_json,superseded_by_decision_id,created_at,updated_at,revision_id,(SELECT r.id FROM intelligence_revisions r WHERE r.entity_kind='decision-acceptance' AND r.entity_id=knowledge_decisions.id ORDER BY r.created_at,r.id LIMIT 1) FROM knowledge_decisions;
-- Rebuild dependent foreign keys alongside their parent. D1 enforces them at commit.
CREATE TABLE decision_citations_retained AS SELECT * FROM decision_citations;
CREATE TABLE decision_reviews_retained AS SELECT * FROM decision_reviews;
DROP TABLE decision_citations;
DROP TABLE decision_reviews;
DROP TABLE knowledge_decisions;
ALTER TABLE knowledge_decisions_next RENAME TO knowledge_decisions;
CREATE UNIQUE INDEX knowledge_decisions_active_page_idx ON knowledge_decisions(page_id) WHERE removed_at IS NULL;
CREATE INDEX knowledge_decisions_workspace_state_idx ON knowledge_decisions(workspace_id,state,review_at);

CREATE TABLE decision_citations (
  decision_id TEXT NOT NULL REFERENCES knowledge_decisions(id),
  page_revision_id TEXT NOT NULL REFERENCES page_revisions(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY(decision_id, page_revision_id)
);

CREATE TABLE decision_reviews (
  id TEXT PRIMARY KEY NOT NULL,
  decision_id TEXT NOT NULL REFERENCES knowledge_decisions(id),
  note TEXT NOT NULL,
  reviewed_by_member_id TEXT NOT NULL REFERENCES members(id),
  next_review_at TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO decision_citations SELECT * FROM decision_citations_retained;
INSERT INTO decision_reviews SELECT * FROM decision_reviews_retained;
DROP TABLE decision_citations_retained;
DROP TABLE decision_reviews_retained;
