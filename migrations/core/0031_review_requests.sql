-- STAT-006. Assignment is work, never an access grant. History and delivery
-- identities survive portability so restoring a request cannot replay a notice.
CREATE TABLE review_requests (
 id TEXT PRIMARY KEY NOT NULL,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 page_id TEXT NOT NULL REFERENCES pages(id),
 requester_member_id TEXT NOT NULL REFERENCES members(id),
 assignee_kind TEXT NOT NULL CHECK(assignee_kind IN ('member','group')),
 assignee_id TEXT NOT NULL,
 assignment_generation INTEGER NOT NULL DEFAULT 1 CHECK(assignment_generation>0),
 requested_revision_id TEXT NOT NULL,
 due_date TEXT NOT NULL,
 due_time TEXT NOT NULL,
 timezone TEXT NOT NULL,
 due_at TEXT NOT NULL,
 note TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','verified','changes_requested','cancelled')),
 revision_id TEXT NOT NULL,
 comment_id TEXT REFERENCES comments(id),
 resolved_by_member_id TEXT REFERENCES members(id),
 resolved_at TEXT,
 dispatch_paused_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX review_requests_assignee ON review_requests(workspace_id,state,assignee_kind,assignee_id,due_at,id);
CREATE INDEX review_requests_requester ON review_requests(workspace_id,requester_member_id,state,due_at,id);
CREATE INDEX review_requests_page ON review_requests(page_id,state,created_at,id);
CREATE TABLE review_request_history (
 id TEXT PRIMARY KEY NOT NULL,
 request_id TEXT NOT NULL REFERENCES review_requests(id),
 assignment_generation INTEGER NOT NULL,
 actor_member_id TEXT NOT NULL REFERENCES members(id),
 action TEXT NOT NULL CHECK(action IN ('requested','reassigned','cancelled','verified','changes_requested')),
 snapshot_json TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX review_request_history_request ON review_request_history(request_id,created_at,id);
CREATE TABLE review_request_deliveries (
 request_id TEXT NOT NULL REFERENCES review_requests(id),
 assignment_generation INTEGER NOT NULL,
 stage TEXT NOT NULL CHECK(stage IN ('assigned','reviewer','owner')),
 created_at TEXT NOT NULL,
 PRIMARY KEY(request_id,assignment_generation,stage)
);
