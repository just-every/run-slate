import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { currentSubject } from '../sharing/current-access';
import { accessSql, pageAccessLevelSql } from '../search/access-sql';
import { expiringBefore, latestVerificationSql } from './state';

/**
 * The "Needs review" list (STAT-003, STAT-004): pages the member may read today whose
 * latest verification lapsed, lapses within two weeks, was made on an older revision, or
 * whose verifier is no longer an active member. Every request evaluates live access with
 * the same SQL as search, so a page the member cannot read adds no row, count or title.
 * The list never renews anything; verifying again is the page's own one-person action.
 */
export const reviewFilters = ['mine', 'everyone', 'no-verifier'] as const;
export type ReviewFilter = typeof reviewFilters[number];
export type ReviewState = 'lapsed' | 'changed' | 'expiring' | 'current';
export interface ReviewItem {
  pageId: string; title: string; containerId: string; /** Only for members who can open the space itself. */ containerName: string | null; state: ReviewState;
  verifier: { id: string; displayName: string; active: boolean }; verifiedAt: string; expiresAt: string | null;
  verifiedRevisionId: string; workingRevisionId: string; pageRevisionId: string; statusKey: string;
  revisionsSince: number; editorsSince: string[]; canVerify: boolean; openedCurrent: boolean; reviewHref: string;
}
export interface ReviewCounts { mine: number; everyone: number; noVerifier: number | null }

const needsReview = "state IN ('lapsed','changed','expiring')";
const encodeCursor = (row: { rank: number; due: string; id: string }) => btoa(JSON.stringify([row.rank, row.due, row.id])).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
function decodeCursor(cursor: string): [number, string, string] {
  try {
    const value = JSON.parse(atob(cursor.replaceAll('-', '+').replaceAll('_', '/')));
    if (Array.isArray(value) && value.length === 3 && Number.isInteger(value[0]) && typeof value[1] === 'string' && typeof value[2] === 'string') return value as [number, string, string];
  } catch { /* reported below */ }
  throw new ApiProblem(400, 'INVALID_CURSOR', 'This list position is no longer valid. Start from the first page.');
}

async function workspaceOwner(ctx: FeatureContext) {
  return !!await ctx.db.prepare("SELECT 1 FROM members WHERE id=? AND workspace_id=? AND role='owner' AND member_kind='member' AND status='active'").bind(ctx.actor.id, ctx.actor.workspaceId).first();
}

export async function reviewQueue(ctx: FeatureContext, input: { filter?: string; cursor?: string; limit?: number }) {
  const subject = await currentSubject(ctx);
  const filter = (input.filter ?? 'everyone') as ReviewFilter;
  if (!reviewFilters.includes(filter)) throw new ApiProblem(400, 'INVALID_FILTER', 'Choose Mine, Everyone or No active verifier.');
  const owner = await workspaceOwner(ctx);
  if (filter === 'no-verifier' && !owner) throw new ApiProblem(403, 'FORBIDDEN', 'Only workspace owners see pages whose verifier left.');
  const limit = Number.isFinite(input.limit) ? Math.min(100, Math.max(1, Math.trunc(input.limit!))) : 50;
  const after = input.cursor ? decodeCursor(input.cursor) : null;
  const acl = accessSql(subject, ctx.now, false);
  const selected = filter === 'mine' ? `owner_member_id=(SELECT member FROM subject) AND ${needsReview}` : filter === 'everyone' ? needsReview : 'NOT verifier_active';
  // Revisions after the attestation, limited to those the member's history shows (REV-002).
  const since = (authors: boolean) => `FROM page_revisions r${authors ? ' JOIN members em ON em.id=r.author_member_id' : ''} WHERE r.page_id=q.id AND r.created_at>q.verified_at AND r.deleted_at IS NULL AND (q.access_level>=3 OR EXISTS(SELECT 1 FROM content_published_revisions pv WHERE pv.page_id=r.page_id AND pv.revision_id=r.id))`;
  const sql = `WITH RECURSIVE candidates AS MATERIALIZED (
 SELECT p.id AS page_id,v.id AS verification_id FROM pages p JOIN page_verifications v ON v.id=${latestVerificationSql('p')}
 WHERE p.workspace_id=? AND p.deleted_at IS NULL AND p.trashed_at IS NULL AND p.archived_at IS NULL AND p.lifecycle<>'archived' AND p.status_key IS v.status_key
 ),${acl.sql},
 listed AS (
 SELECT p.id,p.container_id,CASE WHEN c.owned OR COALESCE(cl.level,0)>0 THEN c.name END AS container_name,p.revision_id AS page_revision_id,p.working_revision_id,p.status_key,
 CASE WHEN ${pageAccessLevelSql}<3 AND p.published_revision_id IS NOT NULL AND p.published_revision_id<>p.working_revision_id THEN COALESCE(json_extract(pr.properties_json,'$.title'),'Untitled') ELSE p.title END AS title,
 ${pageAccessLevelSql} AS access_level,
 v.revision_id AS verified_revision_id,v.expires_at,v.created_at AS verified_at,v.owner_member_id,COALESCE(m.display_name,'Former member') AS verifier_name,
 COALESCE(m.status='active' AND m.workspace_id=p.workspace_id,0) AS verifier_active,
 CASE WHEN v.expires_at<=s.now THEN 'lapsed' WHEN v.revision_id<>p.working_revision_id THEN 'changed' WHEN v.expires_at<=? THEN 'expiring' ELSE 'current' END AS state
 FROM candidates t JOIN pages p ON p.id=t.page_id JOIN page_verifications v ON v.id=t.verification_id LEFT JOIN members m ON m.id=v.owner_member_id
 LEFT JOIN page_revisions pr ON pr.id=p.published_revision_id AND pr.page_id=p.id
 LEFT JOIN page_levels pl ON pl.id=p.id LEFT JOIN page_grants_live g ON g.page_id=p.id LEFT JOIN containers_live c ON c.id=p.container_id LEFT JOIN container_levels cl ON cl.id=c.id LEFT JOIN content_archive_locations l ON l.page_id=p.id,subject s
 ),
 readable AS MATERIALIZED (SELECT *,CASE state WHEN 'lapsed' THEN 0 WHEN 'changed' THEN 1 WHEN 'expiring' THEN 2 ELSE 3 END AS rank,COALESCE(expires_at,'') AS due FROM listed WHERE access_level>0),
 queue AS (SELECT * FROM readable WHERE ${selected})
 SELECT
 (SELECT json_group_array(json_object('id',q.id,'title',q.title,'containerId',q.container_id,'containerName',q.container_name,'state',q.state,'verifierId',q.owner_member_id,'verifierName',q.verifier_name,'verifierActive',q.verifier_active,'verifiedAt',q.verified_at,'expiresAt',q.expires_at,
  'verifiedRevisionId',q.verified_revision_id,'workingRevisionId',q.working_revision_id,'pageRevisionId',q.page_revision_id,'statusKey',q.status_key,'accessLevel',q.access_level,'rank',q.rank,'due',q.due,
  'revisionsSince',(SELECT COUNT(*) ${since(false)}),
  'editorsSince',json((SELECT json_group_array(name) FROM (SELECT DISTINCT em.display_name AS name ${since(true)} ORDER BY 1))),
  'openedCurrent',EXISTS(SELECT 1 FROM content_page_opens o WHERE o.member_id=(SELECT member FROM subject) AND o.page_id=q.id AND o.revision_id=q.working_revision_id)))
  FROM (SELECT * FROM queue q WHERE ? IS NULL OR (q.rank,q.due,q.id)>(?,?,?) ORDER BY q.rank,q.due,q.id LIMIT ?) q) AS items,
 (SELECT COUNT(*) FROM queue) AS total,
 (SELECT COUNT(*) FROM readable WHERE owner_member_id=(SELECT member FROM subject) AND ${needsReview}) AS mine,
 (SELECT COUNT(*) FROM readable WHERE ${needsReview}) AS everyone,
 (SELECT COUNT(*) FROM readable WHERE NOT verifier_active) AS no_verifier`;
  const row = await ctx.db.prepare(sql).bind(ctx.actor.workspaceId, ...acl.parameters, expiringBefore(ctx.now), after ? 1 : null, after?.[0] ?? null, after?.[1] ?? null, after?.[2] ?? null, limit + 1).first<{ items: string; total: number; mine: number; everyone: number; no_verifier: number }>();
  const rows = JSON.parse(row?.items ?? '[]') as Record<string, any>[];
  const page = rows.slice(0, limit);
  const items: ReviewItem[] = page.map(r => ({
    pageId: r.id, title: r.title, containerId: r.containerId, containerName: r.containerName, state: r.state,
    verifier: { id: r.verifierId, displayName: r.verifierName, active: !!r.verifierActive }, verifiedAt: r.verifiedAt, expiresAt: r.expiresAt,
    verifiedRevisionId: r.verifiedRevisionId, workingRevisionId: r.workingRevisionId, pageRevisionId: r.pageRevisionId, statusKey: r.statusKey,
    revisionsSince: r.revisionsSince, editorsSince: r.editorsSince,
    canVerify: r.accessLevel >= 3, openedCurrent: !!r.openedCurrent,
    reviewHref: reviewHref(r.id, r.accessLevel >= 3 && r.verifiedRevisionId !== r.workingRevisionId ? { verified: r.verifiedRevisionId, working: r.workingRevisionId } : null),
  }));
  const last = page.at(-1);
  const counts: ReviewCounts = { mine: row?.mine ?? 0, everyone: row?.everyone ?? 0, noVerifier: owner ? row?.no_verifier ?? 0 : null };
  return { items, total: row?.total ?? 0, counts, filter, ...(rows.length > limit && last ? { nextCursor: encodeCursor({ rank: last.rank, due: last.due, id: last.id }) } : {}) };
}

/** The sidebar count: the member's own attestations that need review, and for owners the pages whose verifier left. */
export async function reviewCount(ctx: FeatureContext) {
  const { counts } = await reviewQueue(ctx, { filter: 'mine', limit: 1 });
  return { count: counts.mine + (counts.noVerifier ?? 0) };
}

/** "Review" opens the page at the compare view between the verified revision and now (REV-004). */
export function reviewHref(pageId: string, compare: { verified: string; working: string } | null) {
  const params = new URLSearchParams({ detail: compare ? 'history' : 'status' });
  if (compare) { params.set('revision', compare.verified); params.set('compare', compare.working); }
  return `/app/pages/${encodeURIComponent(pageId)}?${params}`;
}
