import { env } from "cloudflare:test";
import { SESSION_COOKIE_NAME } from "../../../src/core/platform/auth/cookie";
import { createOpaqueToken, sessionDigest } from "../../../src/core/platform/auth/token";
import type {
  AccessLevel,
  ContainerVisibility,
  ExternalAccess,
  GrantPrincipalKind,
  MemberStatus,
  PageLifecycle,
} from "../../../src/core/shared/knowledge/model";
import {
  resolveKnowledgePolicyProfile,
  type KnowledgePolicyProfile,
} from "../../../src/core/shared/knowledge/policies";
import { createUlid } from "../../../src/core/shared/ulid";

/**
 * The shared fixture helper for the Workers-runtime suite. Every product lane
 * builds its starting state from here so a clause journey reads as the journey
 * and not as twenty INSERTs.
 *
 * Three rules keep these fixtures honest:
 *
 *   - They insert rows straight into `env.DB` against
 *     `migrations/core/0001_knowledge_foundation.sql`. No service, repository or
 *     route is involved, so a fixture can never make a product path look like it
 *     works. Every CHECK, UNIQUE and foreign key in the migration still applies:
 *     a wrong fixture fails loudly at the database.
 *   - `sessionFor` is the one exception, and only in the direction that matters:
 *     it mints and hashes the session token exactly as
 *     `src/core/features/session/service.ts` does, through the real
 *     `createOpaqueToken` and `sessionDigest`. Nothing here writes a digest of its own.
 *   - No product logic. These helpers hold no defaults a feature is supposed to
 *     decide; what they do fill in (timestamps, ULIDs, tree positions) is
 *     bookkeeping the schema demands of every writer.
 *
 * Every helper returns the identifiers it created, so a journey names what it
 * seeded rather than re-reading it.
 */

/** Session lifetime used by `createLocalSession` in the session service. */
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function nowIso(): string {
  return new Date().toISOString();
}

async function run(sql: string, ...values: unknown[]): Promise<void> {
  await env.DB.prepare(sql).bind(...values).run();
}

/** Two uppercase letters, the shape `members.initials` carries everywhere. */
function initialsFor(displayName: string): string {
  const parts = displayName.trim().split(/\s+/u).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]![0]}${parts[parts.length - 1]![0]}` : (parts[0] ?? "M").slice(0, 2);
  return letters.toUpperCase().padEnd(2, "X");
}

export interface SeedWorkspaceInput {
  name?: string;
  mark?: string;
  description?: string;
  guestAccess?: ExternalAccess;
  publicLinkAccess?: ExternalAccess;
  anonymousAccess?: ExternalAccess;
  aiEnabled?: boolean;
  aiMonthlyBudgetMicros?: number;
  /**
   * Overrides for the eight knowledge policies. The schema stores the whole
   * superset under either value of every policy, so a profile is not a column:
   * it is resolved and validated here and handed back for the journey to drive
   * `contract.profile` with. An unsupported value throws.
   */
  profile?: Partial<KnowledgePolicyProfile>;
}

export interface SeededWorkspace {
  workspaceId: string;
  revisionId: string;
  policyProfile: KnowledgePolicyProfile;
}

export async function seedWorkspace(overrides: SeedWorkspaceInput = {}): Promise<SeededWorkspace> {
  const workspaceId = createUlid();
  const revisionId = createUlid();
  const timestamp = nowIso();
  const policyProfile = resolveKnowledgePolicyProfile(overrides.profile);

  await run(
    `INSERT INTO workspaces (id, name, mark, description, guest_access, public_link_access, anonymous_access, ai_enabled, ai_monthly_budget_micros, created_at, updated_at, revision_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    workspaceId,
    overrides.name ?? "Aurora",
    overrides.mark ?? "AU",
    overrides.description ?? "",
    overrides.guestAccess ?? "allowed",
    overrides.publicLinkAccess ?? "allowed",
    overrides.anonymousAccess ?? "allowed",
    overrides.aiEnabled ? 1 : 0,
    overrides.aiMonthlyBudgetMicros ?? 0,
    timestamp,
    timestamp,
    revisionId,
  );

  return { workspaceId, revisionId, policyProfile };
}

export interface SeedMemberInput {
  role: "owner" | "member";
  email: string;
  displayName: string;
  /** A guest is stored as `member_kind = 'guest'`. */
  isGuest?: boolean;
  status?: MemberStatus;
  initials?: string;
  isSetupOwner?: boolean;
  theme?: "light" | "dark" | "system";
}

export async function seedMember(workspaceId: string, input: SeedMemberInput): Promise<{ memberId: string }> {
  const memberId = createUlid();
  const timestamp = nowIso();

  await run(
    `INSERT INTO members (id, workspace_id, email, display_name, initials, role, member_kind, status, is_setup_owner, theme, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    memberId,
    workspaceId,
    input.email,
    input.displayName,
    input.initials ?? initialsFor(input.displayName),
    input.role,
    input.isGuest ? "guest" : "member",
    input.status ?? "active",
    input.isSetupOwner ? 1 : 0,
    input.theme ?? "system",
    timestamp,
    timestamp,
  );

  return { memberId };
}

export interface SeedGroupInput {
  name: string;
  /** Members placed in the group; each becomes a `group_members` row. */
  memberIds?: readonly string[];
}

export async function seedGroup(workspaceId: string, input: SeedGroupInput): Promise<{ groupId: string; revisionId: string }> {
  const groupId = createUlid();
  const revisionId = createUlid();
  const timestamp = nowIso();

  await run(
    `INSERT INTO groups (id, workspace_id, name, created_at, updated_at, revision_id) VALUES (?, ?, ?, ?, ?, ?)`,
    groupId,
    workspaceId,
    input.name,
    timestamp,
    timestamp,
    revisionId,
  );

  for (const memberId of input.memberIds ?? []) {
    await run(`INSERT INTO group_members (group_id, member_id, created_at) VALUES (?, ?, ?)`, groupId, memberId, timestamp);
  }

  return { groupId, revisionId };
}

export interface SeedContainerInput {
  ownerMemberId: string;
  visibility: ContainerVisibility;
  /**
   * A personal container. The schema expresses that as `visibility =
   * 'personal'`, so the two must agree; passing `personal` with any other
   * visibility throws rather than quietly seeding something the product could
   * never produce.
   */
  personal?: boolean;
  name?: string;
  key?: string;
  icon?: string;
  description?: string;
  guestAccess?: ExternalAccess;
  publicLinkAccess?: ExternalAccess;
  anonymousAccess?: ExternalAccess;
  /** Further members of the container. The owner is always one. */
  memberIds?: readonly string[];
}

export interface SeededContainer {
  containerId: string;
  revisionId: string;
  ownerMemberId: string;
}

export async function seedContainer(workspaceId: string, input: SeedContainerInput): Promise<SeededContainer> {
  if (input.personal !== undefined && input.personal !== (input.visibility === "personal")) {
    throw new Error(`A personal container is stored as visibility 'personal'; got personal=${input.personal} with visibility '${input.visibility}'.`);
  }

  const containerId = createUlid();
  const revisionId = createUlid();
  const timestamp = nowIso();

  await run(
    `INSERT INTO containers (id, workspace_id, key, icon, name, description, visibility, guest_access, public_link_access, anonymous_access, created_at, updated_at, revision_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    containerId,
    workspaceId,
    input.key ?? null,
    input.icon ?? null,
    input.name ?? "Handbook",
    input.description ?? "",
    input.visibility,
    input.guestAccess ?? "allowed",
    input.publicLinkAccess ?? "allowed",
    input.anonymousAccess ?? "allowed",
    timestamp,
    timestamp,
    revisionId,
  );

  await run(
    `INSERT INTO container_owners (container_id, member_id, created_at) VALUES (?, ?, ?)`,
    containerId,
    input.ownerMemberId,
    timestamp,
  );

  for (const memberId of new Set([input.ownerMemberId, ...(input.memberIds ?? [])])) {
    await seedContainerMember(containerId, memberId);
  }

  return { containerId, revisionId, ownerMemberId: input.ownerMemberId };
}

export async function seedContainerMember(containerId: string, memberId: string): Promise<{ containerId: string; memberId: string }> {
  await run(
    `INSERT INTO container_members (container_id, member_id, created_at) VALUES (?, ?, ?)`,
    containerId,
    memberId,
    nowIso(),
  );
  return { containerId, memberId };
}

export interface SeedPageInput {
  title: string;
  authorMemberId: string;
  parentPageId?: string;
  lifecycle?: PageLifecycle;
  pageKind?: "page" | "database" | "record";
  ownerMemberId?: string;
  icon?: string;
  statusKey?: string;
  /** `'restricted'` stops the page inheriting container and ancestor grants. */
  accessInheritance?: "inherit" | "restricted";
  treePosition?: string;
}

export interface SeededPage {
  pageId: string;
  workspaceId: string;
  containerId: string;
  workingRevisionId: string;
  revisionId: string;
}

/**
 * `pages.workspace_id` must match the container's, so it is read from the
 * container rather than passed in and trusted.
 */
export async function seedPage(containerId: string, input: SeedPageInput): Promise<SeededPage> {
  const container = await env.DB.prepare(`SELECT workspace_id FROM containers WHERE id = ?`)
    .bind(containerId)
    .first<{ workspace_id: string }>();
  if (!container) throw new Error(`No container ${containerId}: seed it with seedContainer before seeding a page.`);

  const pageId = createUlid();
  const workingRevisionId = createUlid();
  const revisionId = createUlid();
  const timestamp = nowIso();

  await run(
    `INSERT INTO pages (id, workspace_id, container_id, parent_page_id, page_kind, title, icon, author_member_id, owner_member_id, lifecycle, working_revision_id, status_key, tree_position, access_inheritance, created_at, updated_at, revision_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    pageId,
    container.workspace_id,
    containerId,
    input.parentPageId ?? null,
    input.pageKind ?? "page",
    input.title,
    input.icon ?? null,
    input.authorMemberId,
    input.ownerMemberId ?? null,
    input.lifecycle ?? "live",
    workingRevisionId,
    input.statusKey ?? null,
    input.treePosition ?? pageId,
    input.accessInheritance ?? "inherit",
    timestamp,
    timestamp,
    revisionId,
  );

  return { pageId, workspaceId: container.workspace_id, containerId, workingRevisionId, revisionId };
}

export interface SeedBlockInput {
  type: string;
  /** Serialised into `content_json`; the block schema belongs to the feature. */
  content: unknown;
  parentBlockId?: string;
  treePosition?: string;
}

export async function seedBlock(pageId: string, input: SeedBlockInput): Promise<{ blockId: string; revisionId: string }> {
  const blockId = createUlid();
  const revisionId = createUlid();
  const timestamp = nowIso();

  await run(
    `INSERT INTO page_blocks (id, page_id, parent_block_id, block_type, content_json, tree_position, revision_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    blockId,
    pageId,
    input.parentBlockId ?? null,
    input.type,
    JSON.stringify(input.content),
    // ULIDs sort by creation, so blocks seeded in order read back in order.
    input.treePosition ?? blockId,
    revisionId,
    timestamp,
    timestamp,
  );

  return { blockId, revisionId };
}

export interface SeedGrantInput {
  principalKind: GrantPrincipalKind;
  principalId: string;
  level: AccessLevel;
  expiresAt?: string | null;
  revokedAt?: string | null;
}

export async function seedPageGrant(pageId: string, input: SeedGrantInput): Promise<{ grantId: string }> {
  const grantId = createUlid();
  const timestamp = nowIso();

  await run(
    `INSERT INTO page_grants (id, page_id, principal_kind, principal_id, level, expires_at, revoked_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    grantId,
    pageId,
    input.principalKind,
    input.principalId,
    input.level,
    input.expiresAt ?? null,
    input.revokedAt ?? null,
    timestamp,
    timestamp,
  );

  return { grantId };
}

export async function seedContainerGrant(containerId: string, input: SeedGrantInput): Promise<{ grantId: string }> {
  const grantId = createUlid();
  const timestamp = nowIso();

  await run(
    `INSERT INTO container_grants (id, container_id, principal_kind, principal_id, level, expires_at, revoked_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    grantId,
    containerId,
    input.principalKind,
    input.principalId,
    input.level,
    input.expiresAt ?? null,
    input.revokedAt ?? null,
    timestamp,
    timestamp,
  );

  return { grantId };
}

export interface SessionForInput {
  /** Defaults to 30 days out, the lifetime the session service grants. */
  expiresAt?: string;
  /** Set to build the revoked control of the session transport matrix. */
  revokedAt?: string;
}

/**
 * Inserts a session row the way sign-in does — an opaque token, its keyed HMAC
 * digest, nothing else stored — and returns the `Cookie` request header value
 * that carries it. The token itself never reaches the database, so an expired
 * or revoked control is built by inserting those columns, never by handing back
 * a token no row matches.
 */
export async function sessionFor(memberId: string, options: SessionForInput = {}): Promise<string> {
  if (!env.SESSION_SECRET) throw new Error("The session fixture requires SESSION_SECRET.");
  const token = createOpaqueToken();
  const created = new Date();
  const timestamp = created.toISOString();

  await run(
    `INSERT INTO sessions (id, member_id, token_digest, created_at, updated_at, expires_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    createUlid(),
    memberId,
    await sessionDigest(env.SESSION_SECRET, token),
    timestamp,
    timestamp,
    options.expiresAt ?? new Date(created.getTime() + THIRTY_DAYS_MS).toISOString(),
    options.revokedAt ?? null,
  );

  return `${SESSION_COOKIE_NAME}=${token}`;
}
