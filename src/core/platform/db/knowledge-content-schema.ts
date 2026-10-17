import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const knowledgeContainers = sqliteTable("containers", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  key: text("key"),
  icon: text("icon"),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  visibility: text("visibility").notNull().default("default"),
  guestAccess: text("guest_access").notNull().default("allowed"),
  publicLinkAccess: text("public_link_access").notNull().default("allowed"),
  anonymousAccess: text("anonymous_access").notNull().default("allowed"),
  archivedAt: text("archived_at"),
  trashedAt: text("trashed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  revisionId: text("revision_id").notNull(),
}, (table) => [
  uniqueIndex("containers_workspace_key_idx").on(table.workspaceId, table.key),
  index("containers_workspace_visibility_idx").on(table.workspaceId, table.visibility),
]);

export const knowledgeContainerOwners = sqliteTable("container_owners", {
  containerId: text("container_id").notNull(),
  memberId: text("member_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("container_owners_primary_idx").on(table.containerId, table.memberId)]);

export const knowledgeContainerMembers = sqliteTable("container_members", {
  containerId: text("container_id").notNull(),
  memberId: text("member_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("container_members_primary_idx").on(table.containerId, table.memberId),
  index("container_members_member_idx").on(table.memberId, table.containerId),
]);

export const knowledgeContainerGrants = sqliteTable("container_grants", {
  id: text("id").primaryKey(),
  containerId: text("container_id").notNull(),
  principalKind: text("principal_kind").notNull(),
  principalId: text("principal_id").notNull(),
  level: text("level").notNull(),
  expiresAt: text("expires_at"),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("container_grants_principal_idx").on(table.containerId, table.principalKind, table.principalId)]);

export const knowledgePages = sqliteTable("pages", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  containerId: text("container_id").notNull(),
  parentPageId: text("parent_page_id"),
  databaseId: text("database_id"),
  pageKind: text("page_kind").notNull().default("page"),
  title: text("title").notNull(),
  icon: text("icon"),
  coverFileId: text("cover_file_id"),
  authorMemberId: text("author_member_id").notNull(),
  ownerMemberId: text("owner_member_id"),
  lifecycle: text("lifecycle").notNull().default("live"),
  workingRevisionId: text("working_revision_id").notNull(),
  publishedRevisionId: text("published_revision_id"),
  statusKey: text("status_key"),
  treePosition: text("tree_position"),
  accessInheritance: text("access_inheritance").notNull().default("inherit"),
  typeface: text("typeface").notNull().default("default"),
  smallText: integer("small_text", { mode: "boolean" }).notNull().default(false),
  fullWidth: integer("full_width", { mode: "boolean" }).notNull().default(false),
  lockedAt: text("locked_at"),
  lockedByMemberId: text("locked_by_member_id"),
  archivedAt: text("archived_at"),
  trashedAt: text("trashed_at"),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  revisionId: text("revision_id").notNull(),
}, (table) => [
  index("pages_tree_idx").on(table.containerId, table.parentPageId, table.treePosition),
  index("pages_workspace_lifecycle_idx").on(table.workspaceId, table.lifecycle, table.updatedAt),
  index("pages_database_idx").on(table.databaseId, table.treePosition),
]);

export const knowledgePageContributors = sqliteTable("page_contributors", {
  pageId: text("page_id").notNull(),
  memberId: text("member_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("page_contributors_primary_idx").on(table.pageId, table.memberId)]);

export const knowledgePageGrants = sqliteTable("page_grants", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull(),
  principalKind: text("principal_kind").notNull(),
  principalId: text("principal_id").notNull(),
  level: text("level").notNull(),
  expiresAt: text("expires_at"),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("page_grants_principal_idx").on(table.pageId, table.principalKind, table.principalId)]);

export const knowledgeGrantLinks = sqliteTable("grant_links", {
  id: text("id").primaryKey(),
  pageGrantId: text("page_grant_id").notNull(),
  tokenDigest: text("token_digest").notNull(),
  acceptedMemberId: text("accepted_member_id"),
  revokedAt: text("revoked_at"),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("grant_links_token_idx").on(table.tokenDigest)]);

/**
 * The materialised effective access of every page, and the ONE place search (SEARCH-005), mentions and
 * links (LINK-004), content queries (BLOCK-010), analytics (PAGE-013) and the AI answer boundary
 * (AI-013) resolve page visibility from. Nothing walks the page tree at query time: SHARE-003
 * inheritance through an ancestor whose `accessInheritance` is `restricted` is already flattened here,
 * so a reader holding only container-general access never sees a restricted descendant.
 *
 * The rows for one page are rebuilt as a unit, inside the same D1 batch as the change that invalidates
 * them — a grant added, narrowed, revoked or expired; a page's `accessInheritance` changed; a page
 * moved to another parent or container (PAGE-004); or a container grant changed (CONT-009). SHARE-007
 * requires the next request to see the new state, so no deferred job rebuilds it.
 *
 * The uniqueness of a row is enforced in SQL by an expression index over
 * `COALESCE(principal_id, '')`, because `principalId` is null for the two general kinds and SQLite
 * treats nulls as distinct; Drizzle cannot express that index, so it is not declared here.
 */
export const knowledgePageAccessIndex = sqliteTable("page_access_index", {
  workspaceId: text("workspace_id").notNull(),
  pageId: text("page_id").notNull(),
  principalKind: text("principal_kind").notNull(),
  principalId: text("principal_id"),
  level: text("level").notNull(),
  sourceKind: text("source_kind").notNull(),
  sourceId: text("source_id").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("page_access_index_principal_idx").on(table.workspaceId, table.principalKind, table.principalId, table.pageId),
  index("page_access_index_page_idx").on(table.pageId),
]);

export const knowledgePageBlocks = sqliteTable("page_blocks", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull(),
  parentBlockId: text("parent_block_id"),
  blockType: text("block_type").notNull(),
  contentJson: text("content_json").notNull(),
  treePosition: text("tree_position").notNull(),
  revisionId: text("revision_id").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("page_blocks_tree_idx").on(table.pageId, table.parentBlockId, table.treePosition)]);

export const knowledgePageRevisions = sqliteTable("page_revisions", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull(),
  authorMemberId: text("author_member_id"),
  origin: text("origin").notNull(),
  contentHash: text("content_hash").notNull(),
  bodyJson: text("body_json").notNull(),
  propertiesJson: text("properties_json").notNull(),
  statusKey: text("status_key"),
  ordinal: integer("ordinal"),
  label: text("label"),
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
  deletedByMemberId: text("deleted_by_member_id"),
}, (table) => [
  index("page_revisions_page_time_idx").on(table.pageId, table.createdAt, table.id),
  index("page_revisions_page_hash_idx").on(table.pageId, table.contentHash),
]);

/**
 * REV-001 and REV-002: the readable revision history of every record that is not a page — a container,
 * a comment thread, a template and a decision (DEC-006). Rows are immutable and carry the same
 * content-hash discipline as `page_revisions`, so a retried write that reproduces stored content
 * commits nothing. Pages keep their own richer table; this one never holds a page revision.
 */
export const knowledgeRecordRevisions = sqliteTable("record_revisions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  entityKind: text("entity_kind").notNull(),
  entityId: text("entity_id").notNull(),
  ordinal: integer("ordinal"),
  contentHash: text("content_hash").notNull(),
  contentJson: text("content_json").notNull(),
  authorMemberId: text("author_member_id"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("record_revisions_entity_ordinal_idx").on(table.entityKind, table.entityId, table.ordinal),
  uniqueIndex("record_revisions_entity_hash_idx").on(table.entityKind, table.entityId, table.contentHash),
  index("record_revisions_entity_time_idx").on(table.entityKind, table.entityId, table.createdAt, table.id),
]);

export const knowledgePageLabels = sqliteTable("page_labels", {
  pageId: text("page_id").notNull(),
  label: text("label").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("page_labels_primary_idx").on(table.pageId, table.label)]);

export const knowledgeStatusEntries = sqliteTable("status_entries", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  key: text("key").notNull(),
  label: text("label").notNull(),
  color: text("color").notNull(),
  requiresVerification: integer("requires_verification", { mode: "boolean" }).notNull().default(false),
  retiredAt: text("retired_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("status_entries_workspace_key_idx").on(table.workspaceId, table.key)]);

export const knowledgePageVerifications = sqliteTable("page_verifications", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull(),
  revisionId: text("revision_id").notNull(),
  statusKey: text("status_key").notNull(),
  ownerMemberId: text("owner_member_id").notNull(),
  verifiedByMemberId: text("verified_by_member_id").notNull(),
  expiresAt: text("expires_at"),
  lapsedNotifiedAt: text("lapsed_notified_at"),
  createdAt: text("created_at").notNull(),
});

export const knowledgePublicExposures = sqliteTable("public_exposures", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull(),
  host: text("host").notNull(),
  slug: text("slug").notNull(),
  indexable: integer("indexable", { mode: "boolean" }).notNull().default(false),
  theme: text("theme").notNull().default("default"),
  headerControlsJson: text("header_controls_json").notNull().default("[]"),
  duplicateAsTemplate: integer("duplicate_as_template", { mode: "boolean" }).notNull().default(false),
  socialPreviewJson: text("social_preview_json").notNull().default("{}"),
  publishedAt: text("published_at").notNull(),
  revokedAt: text("revoked_at"),
}, (table) => [uniqueIndex("public_exposures_host_slug_idx").on(table.host, table.slug), uniqueIndex("public_exposures_page_idx").on(table.pageId)]);

export const knowledgeFiles = sqliteTable("files", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  pageId: text("page_id"),
  storageKey: text("storage_key").notNull(),
  originalName: text("original_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
}, (table) => [uniqueIndex("files_storage_key_idx").on(table.storageKey), index("files_page_idx").on(table.pageId)]);

export const knowledgeDatabases = sqliteTable("databases", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  structureLockedAt: text("structure_locked_at"),
  structureLockedByMemberId: text("structure_locked_by_member_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  revisionId: text("revision_id").notNull(),
}, (table) => [uniqueIndex("databases_page_idx").on(table.pageId)]);

export const knowledgeDatabaseFields = sqliteTable("database_fields", {
  id: text("id").primaryKey(),
  databaseId: text("database_id").notNull(),
  name: text("name").notNull(),
  fieldType: text("field_type").notNull(),
  configJson: text("config_json").notNull().default("{}"),
  retainedValuesJson: text("retained_values_json").notNull().default("{}"),
  position: integer("position").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  revisionId: text("revision_id").notNull(),
}, (table) => [uniqueIndex("database_fields_position_idx").on(table.databaseId, table.position)]);

export const knowledgeDatabaseRecords = sqliteTable("database_records", {
  pageId: text("page_id").primaryKey(),
  databaseId: text("database_id").notNull(),
  fieldValuesJson: text("field_values_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("database_records_database_idx").on(table.databaseId)]);

export const knowledgeDatabaseViews = sqliteTable("database_views", {
  id: text("id").primaryKey(),
  databaseId: text("database_id").notNull(),
  name: text("name").notNull(),
  layout: text("layout").notNull(),
  filtersJson: text("filters_json").notNull().default("[]"),
  sortsJson: text("sorts_json").notNull().default("[]"),
  groupsJson: text("groups_json").notNull().default("[]"),
  /** DB-007: the per-column calculation each table view carries under its columns. */
  calculationsJson: text("calculations_json").notNull().default("{}"),
  displayJson: text("display_json").notNull().default("{}"),
  position: integer("position").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  revisionId: text("revision_id").notNull(),
}, (table) => [uniqueIndex("database_views_position_idx").on(table.databaseId, table.position)]);

export const knowledgeTemplates = sqliteTable("knowledge_templates", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  containerId: text("container_id"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  isShipped: integer("is_shipped", { mode: "boolean" }).notNull().default(false),
  archivedAt: text("archived_at"),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  revisionId: text("revision_id").notNull(),
}, (table) => [index("knowledge_templates_scope_idx").on(table.workspaceId, table.containerId, table.category)]);
