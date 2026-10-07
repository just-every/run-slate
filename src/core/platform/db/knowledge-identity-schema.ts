import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const knowledgeWorkspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mark: text("mark").notNull(),
  description: text("description").notNull().default(""),
  guestAccess: text("guest_access").notNull().default("allowed"),
  publicLinkAccess: text("public_link_access").notNull().default("allowed"),
  anonymousAccess: text("anonymous_access").notNull().default("allowed"),
  memberContainerCreation: text("member_container_creation").notNull().default("allowed"),
  aiEnabled: integer("ai_enabled", { mode: "boolean" }).notNull().default(false),
  aiMonthlyBudgetMicros: integer("ai_monthly_budget_micros").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  revisionId: text("revision_id").notNull(),
});

export const knowledgeMembers = sqliteTable("members", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  initials: text("initials").notNull(),
  role: text("role").notNull(),
  memberKind: text("member_kind").notNull().default("member"),
  status: text("status").notNull().default("active"),
  isSetupOwner: integer("is_setup_owner", { mode: "boolean" }).notNull().default(false),
  theme: text("theme").notNull().default("system"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("members_workspace_email_idx").on(table.workspaceId, table.email),
  index("members_workspace_status_idx").on(table.workspaceId, table.status),
]);

export const knowledgeGroups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  revisionId: text("revision_id").notNull(),
}, (table) => [uniqueIndex("groups_workspace_name_idx").on(table.workspaceId, table.name)]);

export const knowledgeGroupMembers = sqliteTable("group_members", {
  groupId: text("group_id").notNull(),
  memberId: text("member_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("group_members_primary_idx").on(table.groupId, table.memberId), index("group_members_member_idx").on(table.memberId)]);

export const knowledgeSessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull(),
  tokenDigest: text("token_digest").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
}, (table) => [uniqueIndex("sessions_token_digest_idx").on(table.tokenDigest), index("sessions_member_idx").on(table.memberId, table.expiresAt)]);

export const knowledgeInvitations = sqliteTable("invitations", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  email: text("email").notNull(),
  kind: text("kind").notNull(),
  containerId: text("container_id"),
  pageId: text("page_id"),
  containerGrantId: text("container_grant_id"),
  pageGrantId: text("page_grant_id"),
  tokenDigest: text("token_digest").notNull(),
  invitedByMemberId: text("invited_by_member_id").notNull(),
  acceptedByMemberId: text("accepted_by_member_id"),
  revokedAt: text("revoked_at"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("invitations_token_digest_idx").on(table.tokenDigest),
  index("invitations_workspace_email_idx").on(table.workspaceId, table.email, table.createdAt),
]);

/** MAIL-002: a send that still fails after its bounded retries is recorded with the provider's error and shown to a person. */
export const knowledgeMailDeliveries = sqliteTable("mail_deliveries", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  kind: text("kind").notNull(),
  targetEmail: text("target_email").notNull(),
  invitationId: text("invitation_id"),
  memberId: text("member_id"),
  state: text("state").notNull().default("queued"),
  attemptCount: integer("attempt_count").notNull().default(0),
  provider: text("provider"),
  providerMessageId: text("provider_message_id"),
  errorDetail: text("error_detail"),
  firstAttemptedAt: text("first_attempted_at"),
  lastAttemptedAt: text("last_attempted_at"),
  sentAt: text("sent_at"),
  failedAt: text("failed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("mail_deliveries_target_idx").on(table.workspaceId, table.kind, table.targetEmail, table.createdAt),
  index("mail_deliveries_state_idx").on(table.workspaceId, table.state, table.createdAt),
  index("mail_deliveries_invitation_idx").on(table.invitationId, table.createdAt),
]);
