import type { AccessLevel, ExternalAccessSettings, KnowledgeGrant, MemberSubject, PageLifecycle } from "../../shared/knowledge/model";

const levelRank: Record<AccessLevel, number> = { view: 1, comment: 2, edit: 3, full: 4 };

export interface PageAccessContext {
  page: {
    id: string;
    workspaceId: string;
    containerId: string;
    lifecycle: PageLifecycle;
    authorMemberId: string;
    restricted: boolean;
    grants: readonly KnowledgeGrant[];
  };
  container: {
    id: string;
    workspaceId: string;
    grants: readonly KnowledgeGrant[];
    externalAccess: ExternalAccessSettings;
  };
  inheritedGrants: readonly KnowledgeGrant[];
}

export interface AccessDecision {
  allowed: boolean;
  level: AccessLevel | null;
  source: "author" | "page" | "inherited" | "container" | null;
}

export class AccessDeniedError extends Error {}
export class GrantInvariantError extends Error {}
export class OperationReplayError extends Error {}

export interface SessionBoundGrantLink {
  acceptedMemberId: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface OperationReceiptReplay {
  actorMemberId: string;
  requestHash: string;
  expiresAt: string;
}

function grantIsActive(grant: KnowledgeGrant, now: string): boolean {
  return !grant.revokedAt && (!grant.expiresAt || grant.expiresAt > now);
}

function grantMatches(subject: MemberSubject, grant: KnowledgeGrant, page: PageAccessContext["page"]): boolean {
  if (grant.principalKind === "member") return grant.principalId === subject.memberId;
  if (grant.principalKind === "group") return subject.groupIds.includes(grant.principalId);
  if (grant.principalKind === "container") {
    return grant.principalId === page.containerId && subject.containerIds.includes(grant.principalId);
  }
  return grant.principalId === subject.workspaceId;
}

function strongest(grants: ReadonlyArray<{ grant: KnowledgeGrant; source: AccessDecision["source"] }>, subject: MemberSubject, context: PageAccessContext, now: string): AccessDecision {
  let selected: { grant: KnowledgeGrant; source: AccessDecision["source"] } | null = null;
  for (const candidate of grants) {
    if (!grantIsActive(candidate.grant, now) || !grantMatches(subject, candidate.grant, context.page)) continue;
    if (!selected || levelRank[candidate.grant.level] > levelRank[selected.grant.level]) selected = candidate;
  }
  return selected ? { allowed: true, level: selected.grant.level, source: selected.source } : { allowed: false, level: null, source: null };
}

export function isPrivateLifecycle(lifecycle: PageLifecycle): boolean {
  return lifecycle === "draft" || lifecycle === "scheduled";
}

export function evaluatePageAccess(subject: MemberSubject, context: PageAccessContext, now = new Date().toISOString()): AccessDecision {
  if (subject.status !== "active" || subject.workspaceId !== context.page.workspaceId) return { allowed: false, level: null, source: null };
  if (subject.isGuest && context.container.externalAccess.guests === "forbidden") return { allowed: false, level: null, source: null };

  if (isPrivateLifecycle(context.page.lifecycle)) {
    if (subject.memberId === context.page.authorMemberId) return { allowed: true, level: "full", source: "author" };
    const ownGrants = context.page.grants.filter((grant) => grant.principalKind === "member" || grant.principalKind === "group");
    return strongest(ownGrants.map((grant) => ({ grant, source: "page" as const })), subject, context, now);
  }

  const candidates: Array<{ grant: KnowledgeGrant; source: "page" | "inherited" | "container" }> = context.page.grants.map((grant) => ({ grant, source: "page" }));
  if (!context.page.restricted) {
    candidates.push(...context.inheritedGrants.map((grant) => ({ grant, source: "inherited" as const })));
    candidates.push(...context.container.grants.map((grant) => ({ grant, source: "container" as const })));
  }
  return strongest(candidates, subject, context, now);
}

export function can(decision: AccessDecision, required: AccessLevel): boolean {
  return decision.level !== null && levelRank[decision.level] >= levelRank[required];
}

export function assertDraftGrant(grant: KnowledgeGrant): void {
  if (grant.principalKind === "container" || grant.principalKind === "workspace") {
    throw new GrantInvariantError("Draft pages cannot carry a general access grant.");
  }
}

export function canUseSessionBoundGrantLink(subject: MemberSubject, link: SessionBoundGrantLink, now = new Date().toISOString()): boolean {
  return subject.status === "active"
    && link.acceptedMemberId === subject.memberId
    && !link.revokedAt
    && (!link.expiresAt || link.expiresAt > now);
}

export function generalGrant(grants: readonly KnowledgeGrant[]): KnowledgeGrant | null {
  const found = grants.filter((grant) => grant.principalKind === "container" || grant.principalKind === "workspace");
  if (found.length > 1) throw new GrantInvariantError("A page may carry at most one general access grant.");
  return found[0] ?? null;
}

export function assertNoGrantWidening(before: readonly KnowledgeGrant[], after: readonly KnowledgeGrant[]): void {
  const previous = generalGrant(before);
  const next = generalGrant(after);
  if (!previous && next) throw new GrantInvariantError("A profile switch cannot add a general access grant.");
  if (previous && (!next
    || previous.id !== next.id
    || previous.principalKind !== next.principalKind
    || previous.principalId !== next.principalId
    || previous.level !== next.level
    || previous.expiresAt !== next.expiresAt
    || previous.revokedAt !== next.revokedAt)) {
    throw new GrantInvariantError("A profile switch cannot rewrite or widen a page's general access.");
  }
}

export function canPublishPublicPage(context: PageAccessContext): boolean {
  return !isPrivateLifecycle(context.page.lifecycle) && context.container.externalAccess.publicLinks === "allowed";
}

export function canReadAnonymousPage(context: PageAccessContext, hasLiveExposure: boolean): boolean {
  return !isPrivateLifecycle(context.page.lifecycle)
    && hasLiveExposure
    && context.container.externalAccess.publicLinks === "allowed"
    && context.container.externalAccess.anonymous === "allowed";
}

export function canInviteGuest(context: PageAccessContext): boolean {
  return context.container.externalAccess.guests === "allowed";
}

export function assertCanPublishPublicPage(context: PageAccessContext): void {
  if (!canPublishPublicPage(context)) throw new AccessDeniedError("This page cannot be published to the anonymous web.");
}

export function assertAuthorizedReceiptReplay(input: {
  receipt: OperationReceiptReplay;
  requestHash: string;
  subject: MemberSubject;
  context: PageAccessContext;
  required: AccessLevel;
  now?: string;
}): void {
  const now = input.now ?? new Date().toISOString();
  if (input.receipt.expiresAt <= now) throw new OperationReplayError("The operation receipt has expired.");
  if (input.receipt.actorMemberId !== input.subject.memberId) throw new AccessDeniedError("A receipt belongs to a different member.");
  if (input.receipt.requestHash !== input.requestHash) throw new OperationReplayError("An operation key cannot be reused with a different request.");
  if (!can(evaluatePageAccess(input.subject, input.context, now), input.required)) {
    throw new AccessDeniedError("Current page access is required before replaying an operation.");
  }
}
