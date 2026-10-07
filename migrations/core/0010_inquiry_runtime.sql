-- Durable local inquiry admission, measured routing and quiet ambient discovery.
CREATE TABLE intelligence_route_evaluations (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, revision_id TEXT NOT NULL,
 provider TEXT NOT NULL, model TEXT NOT NULL, task TEXT NOT NULL, evidence_json TEXT NOT NULL,
 measured_fit REAL NOT NULL CHECK(measured_fit BETWEEN 0 AND 1),
 expires_at TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE intelligence_run_equivalence (
 workspace_id TEXT NOT NULL, equivalence_key TEXT NOT NULL, run_id TEXT NOT NULL,
 expires_at TEXT NOT NULL, PRIMARY KEY(workspace_id,equivalence_key)
);
CREATE TABLE intelligence_interruptions (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, recipient_id TEXT NOT NULL,
 equivalence_key TEXT NOT NULL, run_id TEXT NOT NULL, seconds INTEGER NOT NULL CHECK(seconds>=0),
 state TEXT NOT NULL CHECK(state IN ('reserved','delivered','released','suppressed')),
 mandatory INTEGER NOT NULL CHECK(mandatory IN (0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(workspace_id,recipient_id,equivalence_key)
);
CREATE TABLE intelligence_ambient_scopes (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, owner_id TEXT NOT NULL, page_id TEXT NOT NULL,
 revision_id TEXT NOT NULL, refs_json TEXT NOT NULL, audience_json TEXT NOT NULL,
 objective TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('active','stopped','blocked')),
 sweep_seconds INTEGER NOT NULL CHECK(sweep_seconds>=60), audit_percent INTEGER NOT NULL CHECK(audit_percent BETWEEN 0 AND 100),
 threshold REAL NOT NULL CHECK(threshold BETWEEN 0 AND 1), next_sweep_at TEXT NOT NULL,
 reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE intelligence_ambient_events (
 id TEXT PRIMARY KEY, scope_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
 event_key TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('change','frontier-sweep','low-score-audit','shadow')),
 refs_json TEXT NOT NULL, run_id TEXT, comparison_event_id TEXT,
 state TEXT NOT NULL CHECK(state IN ('prepared','running','assessed','failed','blocked')),
 assessment_json TEXT, failure_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(scope_id,event_key,kind)
);
CREATE INDEX intelligence_ambient_due ON intelligence_ambient_scopes(state,next_sweep_at);
CREATE INDEX intelligence_ambient_pending ON intelligence_ambient_events(state,created_at);
