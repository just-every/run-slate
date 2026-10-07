import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const knowledgeCommentThreads = sqliteTable("comment_threads", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  pageId: text("page_id").notNull(),
  kind: text("kind").notNull(),
  blockId: text("block_id"),
  anchorJson: text("anchor_json"),
  anchorRevisionId: text("anchor_revision_id"),
  state: text("state").notNull().default("open"),
  resolvedAt: text("resolved_at"),
  resolvedByMemberId: text("resolved_by_member_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  revisionId: text("revision_id").notNull(),
}, (table) => [index("comment_threads_page_state_idx").on(table.pageId, table.state, table.createdAt)]);

export const knowledgeComments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull(),
  parentCommentId: text("parent_comment_id"),
  authorMemberId: text("author_member_id"),
  bodyJson: text("body_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
  revisionId: text("revision_id").notNull(),
}, (table) => [index("comments_thread_time_idx").on(table.threadId, table.createdAt, table.id)]);

export const knowledgeReactions = sqliteTable("reactions", {
  id: text("id").primaryKey(),
  pageId: text("page_id"),
  commentId: text("comment_id"),
  memberId: text("member_id").notNull(),
  emoji: text("emoji").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("reactions_member_target_emoji_idx").on(table.pageId, table.commentId, table.memberId, table.emoji)]);

export const knowledgePageFavourites = sqliteTable("page_favourites", {
  memberId: text("member_id").notNull(),
  pageId: text("page_id").notNull(),
  position: text("position").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("page_favourites_primary_idx").on(table.memberId, table.pageId)]);

export const knowledgeContainerFavourites = sqliteTable("container_favourites", {
  memberId: text("member_id").notNull(),
  containerId: text("container_id").notNull(),
  position: text("position").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("container_favourites_primary_idx").on(table.memberId, table.containerId)]);

export const knowledgePageWatches = sqliteTable("page_watches", {
  memberId: text("member_id").notNull(),
  pageId: text("page_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("page_watches_primary_idx").on(table.memberId, table.pageId)]);

export const knowledgeRecentPages = sqliteTable("recent_pages", {
  memberId: text("member_id").notNull(),
  pageId: text("page_id").notNull(),
  openedAt: text("opened_at").notNull(),
}, (table) => [uniqueIndex("recent_pages_primary_idx").on(table.memberId, table.pageId), index("recent_pages_member_time_idx").on(table.memberId, table.openedAt)]);

/**
 * PAGE-013: one row per view, so total views, unique viewers over time and the members who viewed
 * are aggregates rather than stored counters, and a container rolls the same figures up over its pages.
 * WEB-003 counts an anonymous view without identifying the viewer, so viewerMemberId is null there.
 */
export const knowledgePageViews = sqliteTable("page_views", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  pageId: text("page_id").notNull(),
  containerId: text("container_id").notNull(),
  viewerMemberId: text("viewer_member_id"),
  viewerKind: text("viewer_kind").notNull(),
  isOwnPage: integer("is_own_page", { mode: "boolean" }).notNull().default(false),
  viewedAt: text("viewed_at").notNull(),
}, (table) => [
  index("page_views_page_time_idx").on(table.pageId, table.viewedAt, table.id),
  index("page_views_container_time_idx").on(table.containerId, table.viewedAt, table.id),
  index("page_views_page_viewer_idx").on(table.pageId, table.viewerMemberId, table.viewedAt),
]);

export const knowledgeNotifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  recipientMemberId: text("recipient_member_id").notNull(),
  sourcePageId: text("source_page_id"),
  commentId: text("comment_id"),
  event: text("event").notNull(),
  detailJson: text("detail_json").notNull().default("{}"),
  readAt: text("read_at"),
  archivedAt: text("archived_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("notifications_recipient_time_idx").on(table.recipientMemberId, table.createdAt)]);

/**
 * NOTIF-003: the one chat destination a workspace owner connects through `chat.notifier.v1`, with the
 * events it receives, its last delivery and last failure. The credential is ciphertext under
 * CONNECTOR_CREDENTIALS_KEY and is destroyed on disconnect, which keeps the row, its event selection
 * and its delivery history.
 */
export const knowledgeChatConnections = sqliteTable("chat_connections", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  destination: text("destination").notNull(),
  targetLabel: text("target_label").notNull(),
  credentialCiphertext: text("credential_ciphertext"),
  eventsJson: text("events_json").notNull().default("[]"),
  state: text("state").notNull().default("connected"),
  needsAttentionReason: text("needs_attention_reason"),
  connectedByMemberId: text("connected_by_member_id").notNull(),
  connectedAt: text("connected_at").notNull(),
  disconnectedAt: text("disconnected_at"),
  lastDeliveredAt: text("last_delivered_at"),
  lastDeliveryEvent: text("last_delivery_event"),
  lastFailedAt: text("last_failed_at"),
  lastFailureReason: text("last_failure_reason"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const knowledgeActivityEntries = sqliteTable("activity_entries", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  actorMemberId: text("actor_member_id"),
  feature: text("feature"),
  action: text("action").notNull(),
  targetKind: text("target_kind").notNull(),
  targetId: text("target_id").notNull(),
  detailJson: text("detail_json").notNull(),
  operationKey: text("operation_key"),
  automationRunId: text("automation_run_id"),
  aiRunId: text("ai_run_id"),
  occurredAt: text("occurred_at").notNull(),
}, (table) => [
  index("knowledge_activity_workspace_time_idx").on(table.workspaceId, table.occurredAt, table.id),
  index("knowledge_activity_target_time_idx").on(table.targetKind, table.targetId, table.occurredAt),
]);

export const knowledgeOperationReceipts = sqliteTable("operation_receipts", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  actorMemberId: text("actor_member_id").notNull(),
  operationKey: text("operation_key").notNull(),
  requestHash: text("request_hash").notNull(),
  targetKind: text("target_kind").notNull(),
  targetId: text("target_id").notNull(),
  responseStatus: integer("response_status").notNull(),
  responseJson: text("response_json").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
}, (table) => [
  uniqueIndex("knowledge_operation_receipts_actor_key_idx").on(table.workspaceId, table.actorMemberId, table.operationKey),
  index("knowledge_operation_receipts_target_idx").on(table.targetKind, table.targetId, table.expiresAt),
]);

export const knowledgeAutomationRules = sqliteTable("automation_rules", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  sourceDatabaseId: text("source_database_id"),
  containerId: text("container_id"),
  scope: text("scope").notNull(),
  name: text("name").notNull(),
  triggerJson: text("trigger_json").notNull(),
  conditionsJson: text("conditions_json").notNull().default("[]"),
  branchJson: text("branch_json"),
  actionsJson: text("actions_json").notNull().default("[]"),
  actorMemberId: text("actor_member_id").notNull(),
  disabledAt: text("disabled_at"),
  /** AUTO-003: a rule that fails repeatedly is disabled and says so. */
  disabledReason: text("disabled_reason"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  revisionId: text("revision_id").notNull(),
}, (table) => [index("automation_rules_scope_idx").on(table.workspaceId, table.scope, table.containerId, table.sourceDatabaseId)]);

export const knowledgeAutomationRuns = sqliteTable("automation_runs", {
  id: text("id").primaryKey(),
  ruleId: text("rule_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  /** AUTO-003: the run log records the actor the run performed as, which the rule may change later. */
  actorMemberId: text("actor_member_id"),
  state: text("state").notNull(),
  triggerJson: text("trigger_json").notNull(),
  recordsJson: text("records_json").notNull().default("[]"),
  detailJson: text("detail_json").notNull().default("{}"),
  /** AUTO-004: a chain of rules stops at `seed.json → limits.automationChainDepth`, so depth is persisted, not inferred. */
  parentRunId: text("parent_run_id"),
  chainDepth: integer("chain_depth").notNull().default(0),
  queuedAt: text("queued_at"),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("automation_runs_rule_time_idx").on(table.ruleId, table.createdAt)]);

export const knowledgeAiAgents = sqliteTable("ai_agents", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  instructions: text("instructions").notNull(),
  sourceScopeJson: text("source_scope_json").notNull(),
  ownerMemberId: text("owner_member_id").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  revisionId: text("revision_id").notNull(),
});

/** AI-015: the chat panel keeps the conversation, so its turns have a parent to belong to. */
export const knowledgeAiConversations = sqliteTable("ai_conversations", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  memberId: text("member_id").notNull(),
  title: text("title").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("ai_conversations_member_time_idx").on(table.memberId, table.updatedAt)]);

export const knowledgeAiRuns = sqliteTable("ai_runs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  requesterMemberId: text("requester_member_id").notNull(),
  agentId: text("agent_id"),
  conversationId: text("conversation_id"),
  state: text("state").notNull(),
  feature: text("feature").notNull(),
  provider: text("provider"),
  model: text("model"),
  inputJson: text("input_json").notNull(),
  /** AI-005 records the input record revisions; AI-006 compares them against the current ones before acceptance. */
  inputRevisionsJson: text("input_revisions_json").notNull().default("[]"),
  proposalJson: text("proposal_json"),
  citationsJson: text("citations_json").notNull().default("[]"),
  /** AI-002: a run reaches Completed when a member accepts or discards it, and discarding records the rejection. */
  outcome: text("outcome"),
  outcomeByMemberId: text("outcome_by_member_id"),
  outcomeAt: text("outcome_at"),
  /** AI-005: the changes the accepting member actually selected. */
  acceptedChangesJson: text("accepted_changes_json"),
  /** AI-008: the reason a Failed or Cancelled run carries, readable on the run. */
  failureReason: text("failure_reason"),
  /** AI-009: at most 3 attempts over 5 minutes, bounded across queue redeliveries. */
  attemptCount: integer("attempt_count").notNull().default(0),
  tokens: integer("tokens"),
  costMicros: integer("cost_micros"),
  reservedMicros: integer("reserved_micros").notNull().default(0),
  startedAt: text("started_at"),
  settledAt: text("settled_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("ai_runs_workspace_time_idx").on(table.workspaceId, table.createdAt),
  index("ai_runs_feature_time_idx").on(table.workspaceId, table.feature, table.createdAt),
  index("ai_runs_conversation_time_idx").on(table.conversationId, table.createdAt),
]);

export const knowledgeAiBudgetReservations = sqliteTable("ai_budget_reservations", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  aiRunId: text("ai_run_id").notNull(),
  month: text("month").notNull(),
  reservedMicros: integer("reserved_micros").notNull(),
  releasedAt: text("released_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("ai_budget_reservations_run_idx").on(table.aiRunId), index("ai_budget_reservations_month_idx").on(table.workspaceId, table.month)]);

export const knowledgeImportJobs = sqliteTable("import_jobs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  requestedByMemberId: text("requested_by_member_id").notNull(),
  operationKey: text("operation_key").notNull(),
  sourceFormat: text("source_format").notNull(),
  sourceFileId: text("source_file_id").notNull(),
  state: text("state").notNull(),
  reportJson: text("report_json").notNull().default("{}"),
  countsJson: text("counts_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
}, (table) => [uniqueIndex("import_jobs_operation_idx").on(table.workspaceId, table.requestedByMemberId, table.operationKey)]);

export const knowledgeImportMappings = sqliteTable("import_mappings", {
  id: text("id").primaryKey(),
  importJobId: text("import_job_id").notNull(),
  sourceKind: text("source_kind").notNull(),
  sourceId: text("source_id").notNull(),
  targetKind: text("target_kind").notNull(),
  targetId: text("target_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("import_mappings_source_idx").on(table.importJobId, table.sourceKind, table.sourceId)]);

export const knowledgeExportJobs = sqliteTable("export_jobs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  requestedByMemberId: text("requested_by_member_id").notNull(),
  scopeKind: text("scope_kind").notNull(),
  scopeId: text("scope_id"),
  format: text("format").notNull(),
  state: text("state").notNull(),
  reportJson: text("report_json").notNull().default("{}"),
  /** PORT-003: an export shows record counts exactly as an import does. */
  countsJson: text("counts_json").notNull().default("{}"),
  fileId: text("file_id"),
  createdAt: text("created_at").notNull(),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
}, (table) => [index("export_jobs_workspace_time_idx").on(table.workspaceId, table.createdAt)]);

/**
 * SEARCH-001: one index over every searchable kind — pages, records, containers, templates and comment
 * threads — keyed by (entityKind, entityId) rather than one row per page.
 *
 * This table carries no access of its own. `pageId` is the governing page of a page-scoped row, and
 * the reader's visibility is resolved by joining `knowledgePageAccessIndex` for that reader's
 * principals — their member id, their groups, container-general for containers they belong to, and
 * workspace-general unless they are a guest. That table is the one place page visibility is resolved
 * from, and the search query never walks the page tree.
 *
 * The columns here decide only what SEARCH-009 hides by default and what SEARCH-003 filters on, and
 * never widen access: `lifecycle` with `authorMemberId` keeps another member's draft out,
 * `personalContainer` keeps CONT-005 out, and `archivedAt`/`trashedAt` are the only default
 * exclusions a member can undo.
 */
export const knowledgeSearchDocuments = sqliteTable("search_documents", {
  entityKind: text("entity_kind").notNull(),
  entityId: text("entity_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  containerId: text("container_id"),
  pageId: text("page_id"),
  title: text("title").notNull(),
  retainedText: text("retained_text").notNull(),
  statusKey: text("status_key"),
  lifecycle: text("lifecycle"),
  authorMemberId: text("author_member_id"),
  contributorIdsJson: text("contributor_ids_json").notNull().default("[]"),
  restricted: integer("restricted", { mode: "boolean" }).notNull().default(false),
  personalContainer: integer("personal_container", { mode: "boolean" }).notNull().default(false),
  archivedAt: text("archived_at"),
  trashedAt: text("trashed_at"),
  subjectUpdatedAt: text("subject_updated_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.entityKind, table.entityId] }),
  index("search_documents_scope_idx").on(table.workspaceId, table.containerId, table.subjectUpdatedAt),
  index("search_documents_kind_idx").on(table.workspaceId, table.entityKind, table.subjectUpdatedAt),
  index("search_documents_page_idx").on(table.pageId),
  index("search_documents_status_idx").on(table.workspaceId, table.statusKey),
]);

export const knowledgeDecisions = sqliteTable("knowledge_decisions", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  question: text("question").notNull(),
  optionsJson: text("options_json").notNull().default("[]"),
  outcome: text("outcome"),
  rationale: text("rationale"),
  ownerMemberId: text("owner_member_id"),
  decidedAt: text("decided_at"),
  reviewAt: text("review_at"),
  /** DEC-005: an overdue decision notifies its owner once per lapse, as STAT-004 does for verification. */
  overdueNotifiedAt: text("overdue_notified_at"),
  state: text("state").notNull().default("proposed"),
  acceptedSnapshotJson: text("accepted_snapshot_json"),
  supersededByDecisionId: text("superseded_by_decision_id"),
  removedAt: text("removed_at"),
  removedByMemberId: text("removed_by_member_id"),
  acceptedRevisionId: text("accepted_revision_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  revisionId: text("revision_id").notNull(),
}, (table) => [uniqueIndex("knowledge_decisions_active_page_idx").on(table.pageId).where(sql`${table.removedAt} IS NULL`), index("knowledge_decisions_workspace_state_idx").on(table.workspaceId, table.state, table.reviewAt)]);

export const knowledgeDecisionCitations = sqliteTable("decision_citations", {
  decisionId: text("decision_id").notNull(),
  pageRevisionId: text("page_revision_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("decision_citations_primary_idx").on(table.decisionId, table.pageRevisionId)]);

export const knowledgeDecisionReviews = sqliteTable("decision_reviews", {
  id: text("id").primaryKey(),
  decisionId: text("decision_id").notNull(),
  note: text("note").notNull(),
  reviewedByMemberId: text("reviewed_by_member_id").notNull(),
  nextReviewAt: text("next_review_at"),
  createdAt: text("created_at").notNull(),
});
