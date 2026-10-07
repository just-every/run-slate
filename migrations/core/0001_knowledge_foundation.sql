PRAGMA foreign_keys = ON;

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  mark TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  guest_access TEXT NOT NULL DEFAULT 'allowed' CHECK (guest_access IN ('allowed', 'forbidden')),
  public_link_access TEXT NOT NULL DEFAULT 'allowed' CHECK (public_link_access IN ('allowed', 'forbidden')),
  anonymous_access TEXT NOT NULL DEFAULT 'allowed' CHECK (anonymous_access IN ('allowed', 'forbidden')),
  member_container_creation TEXT NOT NULL DEFAULT 'allowed' CHECK (member_container_creation IN ('allowed', 'forbidden')),
  ai_enabled INTEGER NOT NULL DEFAULT 0 CHECK (ai_enabled IN (0, 1)),
  ai_monthly_budget_micros INTEGER NOT NULL DEFAULT 0 CHECK (ai_monthly_budget_micros >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision_id TEXT NOT NULL
);

CREATE TABLE members (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  initials TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  member_kind TEXT NOT NULL DEFAULT 'member' CHECK (member_kind IN ('member', 'guest')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'historical', 'removed')),
  is_setup_owner INTEGER NOT NULL DEFAULT 0 CHECK (is_setup_owner IN (0, 1)),
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, email)
);
CREATE INDEX members_workspace_status_idx ON members(workspace_id, status);

CREATE TABLE groups (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  UNIQUE(workspace_id, name)
);

CREATE TABLE group_members (
  group_id TEXT NOT NULL REFERENCES groups(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY(group_id, member_id)
);
CREATE INDEX group_members_member_idx ON group_members(member_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  member_id TEXT NOT NULL REFERENCES members(id),
  token_digest TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX sessions_member_expiry_idx ON sessions(member_id, expires_at);

CREATE TABLE invitations (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  email TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('member', 'guest')),
  container_id TEXT REFERENCES containers(id),
  page_id TEXT REFERENCES pages(id),
  container_grant_id TEXT REFERENCES container_grants(id),
  page_grant_id TEXT REFERENCES page_grants(id),
  token_digest TEXT NOT NULL UNIQUE,
  invited_by_member_id TEXT NOT NULL REFERENCES members(id),
  accepted_by_member_id TEXT REFERENCES members(id),
  revoked_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (container_id IS NULL OR page_id IS NULL),
  CHECK (container_grant_id IS NULL OR container_id IS NOT NULL),
  CHECK (page_grant_id IS NULL OR page_id IS NOT NULL),
  -- WORK-010: a guest is invited to named pages or containers only, never to the workspace at large,
  -- and SHARE-006 shows the pending grant until acceptance, so the grant row exists from the start.
  CHECK (
    kind <> 'guest'
    OR (container_id IS NOT NULL AND container_grant_id IS NOT NULL AND page_id IS NULL AND page_grant_id IS NULL)
    OR (page_id IS NOT NULL AND page_grant_id IS NOT NULL AND container_id IS NULL AND container_grant_id IS NULL)
  )
);
CREATE INDEX invitations_workspace_email_idx ON invitations(workspace_id, email, created_at DESC);

CREATE TABLE mail_deliveries (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  kind TEXT NOT NULL CHECK (kind IN ('sign-in-link', 'invitation')),
  target_email TEXT NOT NULL,
  invitation_id TEXT REFERENCES invitations(id),
  member_id TEXT REFERENCES members(id),
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'sent', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  provider TEXT,
  provider_message_id TEXT,
  error_detail TEXT,
  first_attempted_at TEXT,
  last_attempted_at TEXT,
  sent_at TEXT,
  failed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (kind <> 'invitation' OR invitation_id IS NOT NULL)
);
CREATE INDEX mail_deliveries_target_idx ON mail_deliveries(workspace_id, kind, target_email, created_at DESC);
CREATE INDEX mail_deliveries_state_idx ON mail_deliveries(workspace_id, state, created_at DESC);
CREATE INDEX mail_deliveries_invitation_idx ON mail_deliveries(invitation_id, created_at DESC);

CREATE TABLE containers (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  key TEXT,
  icon TEXT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'default' CHECK (visibility IN ('default', 'open', 'closed', 'private', 'personal')),
  guest_access TEXT NOT NULL DEFAULT 'allowed' CHECK (guest_access IN ('allowed', 'forbidden')),
  public_link_access TEXT NOT NULL DEFAULT 'allowed' CHECK (public_link_access IN ('allowed', 'forbidden')),
  anonymous_access TEXT NOT NULL DEFAULT 'allowed' CHECK (anonymous_access IN ('allowed', 'forbidden')),
  archived_at TEXT,
  trashed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  UNIQUE(workspace_id, key)
);
CREATE INDEX containers_workspace_visibility_idx ON containers(workspace_id, visibility);

CREATE TABLE container_owners (
  container_id TEXT NOT NULL REFERENCES containers(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY(container_id, member_id)
);

CREATE TABLE container_members (
  container_id TEXT NOT NULL REFERENCES containers(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY(container_id, member_id)
);
CREATE INDEX container_members_member_idx ON container_members(member_id, container_id);

CREATE TABLE container_grants (
  id TEXT PRIMARY KEY NOT NULL,
  container_id TEXT NOT NULL REFERENCES containers(id),
  principal_kind TEXT NOT NULL CHECK (principal_kind IN ('member', 'group', 'container', 'workspace')),
  principal_id TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('view', 'comment', 'edit', 'full')),
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX container_grants_principal_idx ON container_grants(container_id, principal_kind, principal_id);

CREATE TABLE pages (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  container_id TEXT NOT NULL REFERENCES containers(id),
  parent_page_id TEXT REFERENCES pages(id),
  database_id TEXT,
  page_kind TEXT NOT NULL DEFAULT 'page' CHECK (page_kind IN ('page', 'database', 'record')),
  title TEXT NOT NULL,
  icon TEXT,
  cover_file_id TEXT,
  author_member_id TEXT NOT NULL REFERENCES members(id),
  owner_member_id TEXT REFERENCES members(id),
  lifecycle TEXT NOT NULL DEFAULT 'live' CHECK (lifecycle IN ('draft', 'scheduled', 'live', 'live-with-unpublished-changes', 'archived')),
  working_revision_id TEXT NOT NULL,
  published_revision_id TEXT,
  status_key TEXT,
  tree_position TEXT,
  access_inheritance TEXT NOT NULL DEFAULT 'inherit' CHECK (access_inheritance IN ('inherit', 'restricted')),
  typeface TEXT NOT NULL DEFAULT 'default' CHECK (typeface IN ('default', 'serif', 'mono')),
  small_text INTEGER NOT NULL DEFAULT 0 CHECK (small_text IN (0, 1)),
  full_width INTEGER NOT NULL DEFAULT 0 CHECK (full_width IN (0, 1)),
  archived_at TEXT,
  trashed_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision_id TEXT NOT NULL
);
CREATE INDEX pages_tree_idx ON pages(container_id, parent_page_id, tree_position);
CREATE INDEX pages_workspace_lifecycle_idx ON pages(workspace_id, lifecycle, updated_at);
CREATE INDEX pages_database_idx ON pages(database_id, tree_position);

CREATE TABLE page_contributors (
  page_id TEXT NOT NULL REFERENCES pages(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY(page_id, member_id)
);

CREATE TABLE page_grants (
  id TEXT PRIMARY KEY NOT NULL,
  page_id TEXT NOT NULL REFERENCES pages(id),
  principal_kind TEXT NOT NULL CHECK (principal_kind IN ('member', 'group', 'container', 'workspace')),
  principal_id TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('view', 'comment', 'edit', 'full')),
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX page_grants_principal_idx ON page_grants(page_id, principal_kind, principal_id);
CREATE UNIQUE INDEX page_grants_one_general_idx ON page_grants(page_id) WHERE principal_kind IN ('container', 'workspace') AND revoked_at IS NULL;

CREATE TRIGGER page_grants_reject_private_general_insert
BEFORE INSERT ON page_grants
WHEN NEW.principal_kind IN ('container', 'workspace')
  AND (SELECT lifecycle FROM pages WHERE id = NEW.page_id) IN ('draft', 'scheduled')
BEGIN
  SELECT RAISE(ABORT, 'Private pages cannot carry a general access grant');
END;

CREATE TRIGGER page_grants_reject_private_general_update
BEFORE UPDATE OF principal_kind, revoked_at ON page_grants
WHEN NEW.principal_kind IN ('container', 'workspace')
  AND (SELECT lifecycle FROM pages WHERE id = NEW.page_id) IN ('draft', 'scheduled')
  AND NEW.revoked_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'Private pages cannot carry a general access grant');
END;

CREATE TRIGGER pages_reject_private_lifecycle_with_general_grant
BEFORE UPDATE OF lifecycle ON pages
WHEN NEW.lifecycle IN ('draft', 'scheduled')
  AND EXISTS (
    SELECT 1 FROM page_grants
    WHERE page_id = NEW.id
      AND principal_kind IN ('container', 'workspace')
      AND revoked_at IS NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'Private pages cannot carry a general access grant');
END;

CREATE TABLE grant_links (
  id TEXT PRIMARY KEY NOT NULL,
  page_grant_id TEXT NOT NULL REFERENCES page_grants(id),
  token_digest TEXT NOT NULL UNIQUE,
  accepted_member_id TEXT REFERENCES members(id),
  revoked_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

-- The materialised effective access of every page, and the ONE place search (SEARCH-005), mentions
-- and links (LINK-004), content queries (BLOCK-010), analytics (PAGE-013) and the AI answer boundary
-- (AI-013) resolve page visibility from. Nothing may walk the page tree at query time: SHARE-003
-- inheritance through an ancestor whose access_inheritance is 'restricted' is already flattened here,
-- so a reader holding only container-general access never sees a restricted descendant.
-- The rows for one page are rebuilt as a unit, inside the same D1 batch as the change that
-- invalidates them: a grant added, narrowed, revoked or expired; a page's access_inheritance
-- changed; a page moved to another parent or container (PAGE-004); or a container grant changed
-- (CONT-009). SHARE-007 requires the next request to see the new state, so no deferred job rebuilds it.
CREATE TABLE page_access_index (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  page_id TEXT NOT NULL REFERENCES pages(id),
  principal_kind TEXT NOT NULL CHECK (principal_kind IN ('member', 'group', 'container', 'workspace', 'container-general', 'workspace-general')),
  principal_id TEXT,
  level TEXT NOT NULL CHECK (level IN ('view', 'comment', 'edit', 'full')),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('own-grant', 'inherited-grant', 'container-general', 'workspace-general')),
  source_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (principal_kind IN ('container-general', 'workspace-general') OR principal_id IS NOT NULL)
);
-- An expression index, not a PRIMARY KEY: principal_id is null for the two general kinds, and SQLite
-- treats nulls as distinct, so a plain key over these columns would not reject a duplicate row.
CREATE UNIQUE INDEX page_access_index_row_idx ON page_access_index(page_id, principal_kind, COALESCE(principal_id, ''), source_kind, source_id);
CREATE INDEX page_access_index_principal_idx ON page_access_index(workspace_id, principal_kind, principal_id, page_id);
CREATE INDEX page_access_index_page_idx ON page_access_index(page_id);

CREATE TABLE page_blocks (
  id TEXT PRIMARY KEY NOT NULL,
  page_id TEXT NOT NULL REFERENCES pages(id),
  parent_block_id TEXT REFERENCES page_blocks(id),
  block_type TEXT NOT NULL,
  content_json TEXT NOT NULL,
  tree_position TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX page_blocks_tree_idx ON page_blocks(page_id, parent_block_id, tree_position);

CREATE TABLE page_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  page_id TEXT NOT NULL REFERENCES pages(id),
  author_member_id TEXT REFERENCES members(id),
  origin TEXT NOT NULL CHECK (origin IN ('autosave', 'publish')),
  content_hash TEXT NOT NULL,
  body_json TEXT NOT NULL,
  properties_json TEXT NOT NULL,
  status_key TEXT,
  ordinal INTEGER,
  label TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by_member_id TEXT REFERENCES members(id)
);
CREATE INDEX page_revisions_page_time_idx ON page_revisions(page_id, created_at DESC, id DESC);
CREATE INDEX page_revisions_page_hash_idx ON page_revisions(page_id, content_hash);

CREATE TABLE record_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  entity_kind TEXT NOT NULL CHECK (entity_kind IN ('container', 'comment-thread', 'template', 'decision')),
  entity_id TEXT NOT NULL,
  ordinal INTEGER,
  content_hash TEXT NOT NULL,
  content_json TEXT NOT NULL,
  author_member_id TEXT REFERENCES members(id),
  created_at TEXT NOT NULL,
  UNIQUE(entity_kind, entity_id, ordinal),
  UNIQUE(entity_kind, entity_id, content_hash)
);
CREATE INDEX record_revisions_entity_time_idx ON record_revisions(entity_kind, entity_id, created_at DESC, id DESC);

CREATE TABLE page_labels (
  page_id TEXT NOT NULL REFERENCES pages(id),
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(page_id, label)
);

CREATE TABLE status_entries (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT NOT NULL,
  requires_verification INTEGER NOT NULL DEFAULT 0 CHECK (requires_verification IN (0, 1)),
  retired_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, key)
);

CREATE TABLE page_verifications (
  id TEXT PRIMARY KEY NOT NULL,
  page_id TEXT NOT NULL REFERENCES pages(id),
  revision_id TEXT NOT NULL REFERENCES page_revisions(id),
  status_key TEXT NOT NULL,
  owner_member_id TEXT NOT NULL REFERENCES members(id),
  verified_by_member_id TEXT NOT NULL REFERENCES members(id),
  expires_at TEXT,
  lapsed_notified_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE public_exposures (
  id TEXT PRIMARY KEY NOT NULL,
  page_id TEXT NOT NULL UNIQUE REFERENCES pages(id),
  host TEXT NOT NULL,
  slug TEXT NOT NULL,
  indexable INTEGER NOT NULL DEFAULT 0 CHECK (indexable IN (0, 1)),
  theme TEXT NOT NULL DEFAULT 'default',
  header_controls_json TEXT NOT NULL DEFAULT '[]',
  duplicate_as_template INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_as_template IN (0, 1)),
  social_preview_json TEXT NOT NULL DEFAULT '{}',
  published_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE(host, slug)
);

CREATE TRIGGER public_exposures_reject_private_page
BEFORE INSERT ON public_exposures
WHEN (SELECT lifecycle FROM pages WHERE id = NEW.page_id) IN ('draft', 'scheduled')
BEGIN
  SELECT RAISE(ABORT, 'Draft and scheduled pages cannot be published anonymously');
END;

CREATE TRIGGER pages_reject_private_lifecycle_with_public_exposure
BEFORE UPDATE OF lifecycle ON pages
WHEN NEW.lifecycle IN ('draft', 'scheduled')
  AND EXISTS (SELECT 1 FROM public_exposures WHERE page_id = NEW.id AND revoked_at IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'Draft and scheduled pages cannot be published anonymously');
END;

CREATE TABLE files (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  page_id TEXT REFERENCES pages(id),
  storage_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX files_page_idx ON files(page_id);

CREATE TABLE databases (
  id TEXT PRIMARY KEY NOT NULL,
  page_id TEXT NOT NULL UNIQUE REFERENCES pages(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  structure_locked_at TEXT,
  structure_locked_by_member_id TEXT REFERENCES members(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision_id TEXT NOT NULL
);

CREATE TABLE database_fields (
  id TEXT PRIMARY KEY NOT NULL,
  database_id TEXT NOT NULL REFERENCES databases(id),
  name TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'checkbox', 'date', 'select', 'multi-select', 'status', 'person', 'file', 'url', 'email', 'phone', 'place', 'relation', 'rollup', 'formula', 'created-at', 'updated-at', 'identifier')),
  config_json TEXT NOT NULL DEFAULT '{}',
  retained_values_json TEXT NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  UNIQUE(database_id, position)
);

CREATE TABLE database_records (
  page_id TEXT PRIMARY KEY REFERENCES pages(id),
  database_id TEXT NOT NULL REFERENCES databases(id),
  field_values_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX database_records_database_idx ON database_records(database_id);

CREATE TABLE database_views (
  id TEXT PRIMARY KEY NOT NULL,
  database_id TEXT NOT NULL REFERENCES databases(id),
  name TEXT NOT NULL,
  layout TEXT NOT NULL CHECK (layout IN ('table', 'board', 'list', 'gallery', 'calendar', 'timeline')),
  filters_json TEXT NOT NULL DEFAULT '[]',
  sorts_json TEXT NOT NULL DEFAULT '[]',
  groups_json TEXT NOT NULL DEFAULT '[]',
  calculations_json TEXT NOT NULL DEFAULT '{}',
  display_json TEXT NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  UNIQUE(database_id, position)
);

CREATE TABLE knowledge_templates (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  container_id TEXT REFERENCES containers(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  is_shipped INTEGER NOT NULL DEFAULT 0 CHECK (is_shipped IN (0, 1)),
  archived_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision_id TEXT NOT NULL
);
CREATE INDEX knowledge_templates_scope_idx ON knowledge_templates(workspace_id, container_id, category);

CREATE TABLE comment_threads (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  page_id TEXT NOT NULL REFERENCES pages(id),
  kind TEXT NOT NULL CHECK (kind IN ('inline', 'page')),
  block_id TEXT REFERENCES page_blocks(id),
  anchor_json TEXT,
  anchor_revision_id TEXT REFERENCES page_revisions(id),
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'resolved')),
  resolved_at TEXT,
  resolved_by_member_id TEXT REFERENCES members(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision_id TEXT NOT NULL
);
CREATE INDEX comment_threads_page_state_idx ON comment_threads(page_id, state, created_at);

CREATE TABLE comments (
  id TEXT PRIMARY KEY NOT NULL,
  thread_id TEXT NOT NULL REFERENCES comment_threads(id),
  parent_comment_id TEXT REFERENCES comments(id),
  author_member_id TEXT REFERENCES members(id),
  body_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  revision_id TEXT NOT NULL
);
CREATE INDEX comments_thread_time_idx ON comments(thread_id, created_at, id);

CREATE TABLE reactions (
  id TEXT PRIMARY KEY NOT NULL,
  page_id TEXT REFERENCES pages(id),
  comment_id TEXT REFERENCES comments(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (page_id IS NOT NULL OR comment_id IS NOT NULL),
  UNIQUE(page_id, comment_id, member_id, emoji)
);

CREATE TABLE page_favourites (
  member_id TEXT NOT NULL REFERENCES members(id),
  page_id TEXT NOT NULL REFERENCES pages(id),
  position TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(member_id, page_id)
);

CREATE TABLE container_favourites (
  member_id TEXT NOT NULL REFERENCES members(id),
  container_id TEXT NOT NULL REFERENCES containers(id),
  position TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(member_id, container_id)
);

CREATE TABLE page_watches (
  member_id TEXT NOT NULL REFERENCES members(id),
  page_id TEXT NOT NULL REFERENCES pages(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY(member_id, page_id)
);

CREATE TABLE recent_pages (
  member_id TEXT NOT NULL REFERENCES members(id),
  page_id TEXT NOT NULL REFERENCES pages(id),
  opened_at TEXT NOT NULL,
  PRIMARY KEY(member_id, page_id)
);
CREATE INDEX recent_pages_member_time_idx ON recent_pages(member_id, opened_at DESC);

CREATE TABLE page_views (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  page_id TEXT NOT NULL REFERENCES pages(id),
  container_id TEXT NOT NULL REFERENCES containers(id),
  viewer_member_id TEXT REFERENCES members(id),
  viewer_kind TEXT NOT NULL CHECK (viewer_kind IN ('member', 'guest', 'anonymous')),
  is_own_page INTEGER NOT NULL DEFAULT 0 CHECK (is_own_page IN (0, 1)),
  viewed_at TEXT NOT NULL,
  CHECK ((viewer_kind = 'anonymous') = (viewer_member_id IS NULL))
);
CREATE INDEX page_views_page_time_idx ON page_views(page_id, viewed_at DESC, id DESC);
CREATE INDEX page_views_container_time_idx ON page_views(container_id, viewed_at DESC, id DESC);
CREATE INDEX page_views_page_viewer_idx ON page_views(page_id, viewer_member_id, viewed_at DESC);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  recipient_member_id TEXT NOT NULL REFERENCES members(id),
  source_page_id TEXT REFERENCES pages(id),
  comment_id TEXT REFERENCES comments(id),
  event TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  read_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX notifications_recipient_time_idx ON notifications(recipient_member_id, created_at DESC);

CREATE TABLE chat_connections (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  destination TEXT NOT NULL,
  target_label TEXT NOT NULL,
  credential_ciphertext TEXT,
  events_json TEXT NOT NULL DEFAULT '[]',
  state TEXT NOT NULL DEFAULT 'connected' CHECK (state IN ('connected', 'needs-attention', 'disconnected')),
  needs_attention_reason TEXT,
  connected_by_member_id TEXT NOT NULL REFERENCES members(id),
  connected_at TEXT NOT NULL,
  disconnected_at TEXT,
  last_delivered_at TEXT,
  last_delivery_event TEXT,
  last_failed_at TEXT,
  last_failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (state <> 'disconnected' OR credential_ciphertext IS NULL),
  CHECK (state <> 'connected' OR credential_ciphertext IS NOT NULL)
);
CREATE UNIQUE INDEX chat_connections_workspace_live_idx ON chat_connections(workspace_id) WHERE disconnected_at IS NULL;

CREATE TABLE activity_entries (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  actor_member_id TEXT REFERENCES members(id),
  feature TEXT,
  action TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  operation_key TEXT,
  automation_run_id TEXT,
  ai_run_id TEXT,
  occurred_at TEXT NOT NULL
);
CREATE INDEX activity_workspace_time_idx ON activity_entries(workspace_id, occurred_at DESC, id DESC);
CREATE INDEX activity_target_time_idx ON activity_entries(target_kind, target_id, occurred_at DESC);

CREATE TABLE operation_receipts (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  actor_member_id TEXT NOT NULL REFERENCES members(id),
  operation_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE(workspace_id, actor_member_id, operation_key)
);
CREATE INDEX operation_receipts_target_idx ON operation_receipts(target_kind, target_id, expires_at);

CREATE TABLE automation_rules (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  source_database_id TEXT REFERENCES databases(id),
  container_id TEXT REFERENCES containers(id),
  scope TEXT NOT NULL CHECK (scope IN ('source', 'container', 'site')),
  name TEXT NOT NULL,
  trigger_json TEXT NOT NULL,
  conditions_json TEXT NOT NULL DEFAULT '[]',
  branch_json TEXT,
  actions_json TEXT NOT NULL DEFAULT '[]',
  actor_member_id TEXT NOT NULL REFERENCES members(id),
  disabled_at TEXT,
  disabled_reason TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision_id TEXT NOT NULL
);
CREATE INDEX automation_rules_scope_idx ON automation_rules(workspace_id, scope, container_id, source_database_id);

CREATE TABLE automation_runs (
  id TEXT PRIMARY KEY NOT NULL,
  rule_id TEXT NOT NULL REFERENCES automation_rules(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  actor_member_id TEXT REFERENCES members(id),
  state TEXT NOT NULL CHECK (state IN ('configuration-changed', 'queued', 'running', 'success', 'no-action', 'condition-not-met', 'throttled', 'error', 'failure', 'disabled')),
  trigger_json TEXT NOT NULL,
  records_json TEXT NOT NULL DEFAULT '[]',
  detail_json TEXT NOT NULL DEFAULT '{}',
  parent_run_id TEXT REFERENCES automation_runs(id),
  chain_depth INTEGER NOT NULL DEFAULT 0 CHECK (chain_depth >= 0),
  queued_at TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX automation_runs_rule_time_idx ON automation_runs(rule_id, created_at DESC);

CREATE TABLE ai_agents (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  instructions TEXT NOT NULL,
  source_scope_json TEXT NOT NULL,
  owner_member_id TEXT NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision_id TEXT NOT NULL
);

CREATE TABLE ai_conversations (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ai_conversations_member_time_idx ON ai_conversations(member_id, updated_at DESC);

CREATE TABLE ai_runs (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  requester_member_id TEXT NOT NULL REFERENCES members(id),
  agent_id TEXT REFERENCES ai_agents(id),
  conversation_id TEXT REFERENCES ai_conversations(id),
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'needs-review', 'completed', 'cancelled', 'failed')),
  feature TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  input_json TEXT NOT NULL,
  input_revisions_json TEXT NOT NULL DEFAULT '[]',
  proposal_json TEXT,
  citations_json TEXT NOT NULL DEFAULT '[]',
  outcome TEXT CHECK (outcome IN ('accepted', 'discarded')),
  outcome_by_member_id TEXT REFERENCES members(id),
  outcome_at TEXT,
  accepted_changes_json TEXT,
  failure_reason TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  tokens INTEGER,
  cost_micros INTEGER,
  reserved_micros INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  settled_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (outcome IS NULL OR state = 'completed'),
  CHECK (outcome IS NULL OR outcome_by_member_id IS NOT NULL)
);
CREATE INDEX ai_runs_workspace_time_idx ON ai_runs(workspace_id, created_at DESC);
CREATE INDEX ai_runs_feature_time_idx ON ai_runs(workspace_id, feature, created_at DESC);
CREATE INDEX ai_runs_conversation_time_idx ON ai_runs(conversation_id, created_at);

CREATE TABLE ai_budget_reservations (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  ai_run_id TEXT NOT NULL UNIQUE REFERENCES ai_runs(id),
  month TEXT NOT NULL,
  reserved_micros INTEGER NOT NULL CHECK (reserved_micros >= 0),
  released_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX ai_budget_reservations_month_idx ON ai_budget_reservations(workspace_id, month);

CREATE TABLE import_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  requested_by_member_id TEXT NOT NULL REFERENCES members(id),
  operation_key TEXT NOT NULL,
  source_format TEXT NOT NULL,
  source_file_id TEXT NOT NULL REFERENCES files(id),
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'completed', 'failed')),
  report_json TEXT NOT NULL DEFAULT '{}',
  counts_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  UNIQUE(workspace_id, requested_by_member_id, operation_key)
);

CREATE TABLE import_mappings (
  id TEXT PRIMARY KEY NOT NULL,
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id),
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(import_job_id, source_kind, source_id)
);

CREATE TABLE export_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  requested_by_member_id TEXT NOT NULL REFERENCES members(id),
  scope_kind TEXT NOT NULL,
  scope_id TEXT,
  format TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'completed', 'failed')),
  report_json TEXT NOT NULL DEFAULT '{}',
  counts_json TEXT NOT NULL DEFAULT '{}',
  file_id TEXT REFERENCES files(id),
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);
CREATE INDEX export_jobs_workspace_time_idx ON export_jobs(workspace_id, created_at DESC);

-- SEARCH-001's one index over every searchable kind. It carries no access of its own: `page_id` is the
-- governing page of a page-scoped row, and the reader's visibility is resolved by joining
-- `page_access_index` for that reader's principals — their member id, their groups, container-general
-- for containers they belong to, and workspace-general unless they are a guest. The columns below
-- decide only what SEARCH-009 hides by default and what SEARCH-003 filters on; they never widen access.
CREATE TABLE search_documents (
  entity_kind TEXT NOT NULL CHECK (entity_kind IN ('page', 'record', 'container', 'template', 'comment-thread')),
  entity_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  container_id TEXT REFERENCES containers(id),
  page_id TEXT REFERENCES pages(id),
  title TEXT NOT NULL,
  retained_text TEXT NOT NULL,
  status_key TEXT,
  lifecycle TEXT,
  author_member_id TEXT REFERENCES members(id),
  contributor_ids_json TEXT NOT NULL DEFAULT '[]',
  restricted INTEGER NOT NULL DEFAULT 0 CHECK (restricted IN (0, 1)),
  personal_container INTEGER NOT NULL DEFAULT 0 CHECK (personal_container IN (0, 1)),
  archived_at TEXT,
  trashed_at TEXT,
  subject_updated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (entity_kind, entity_id),
  CHECK ((entity_kind IN ('page', 'record', 'comment-thread')) = (page_id IS NOT NULL)),
  CHECK (entity_kind NOT IN ('page', 'record', 'comment-thread') OR container_id IS NOT NULL)
);
CREATE INDEX search_documents_scope_idx ON search_documents(workspace_id, container_id, subject_updated_at DESC);
CREATE INDEX search_documents_kind_idx ON search_documents(workspace_id, entity_kind, subject_updated_at DESC);
CREATE INDEX search_documents_page_idx ON search_documents(page_id);
CREATE INDEX search_documents_status_idx ON search_documents(workspace_id, status_key);

CREATE TABLE knowledge_decisions (
  id TEXT PRIMARY KEY NOT NULL,
  page_id TEXT NOT NULL UNIQUE REFERENCES pages(id),
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
  superseded_by_decision_id TEXT REFERENCES knowledge_decisions(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision_id TEXT NOT NULL
);
CREATE INDEX knowledge_decisions_workspace_state_idx ON knowledge_decisions(workspace_id, state, review_at);

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
