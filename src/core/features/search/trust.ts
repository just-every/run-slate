import type { FeatureContext } from '../../app/feature-context';
import { latestVerificationSql, verificationStateSql } from '../page-status/state';
import type { PageTrust } from './trust-types';

export function pageTrustStateSql(page: string, verification: string, now: string) {
  const state = verificationStateSql(page, verification, now);
  return `CASE ${state} WHEN 'current' THEN 'verified' WHEN 'changed' THEN 'lapsed' WHEN 'lapsed' THEN 'lapsed' ELSE 'unverified' END`;
}

/** Authorized-call helper: callers MUST first authorize every supplied page ID.
 * This reads no body and grants no access. Use a type-only import of trust-types
 * in browser code, never an import of this server module. */
export async function loadPageTrust(ctx: FeatureContext, pageIds: string[], revisionIds?: ReadonlyMap<string, string>): Promise<Map<string, PageTrust>> {
  if (!pageIds.length) return new Map();
  const requested = [...new Set(pageIds)].map(id => ({ id, revisionId: revisionIds?.get(id) ?? null }));
  const rows = await ctx.db.prepare(`WITH projected AS (
    SELECT p.id,p.workspace_id,
    CASE WHEN r.id IS NOT NULL AND r.id<>p.working_revision_id THEN json_extract(r.properties_json,'$.statusKey') ELSE p.status_key END AS status_key,
    COALESCE(r.id,p.working_revision_id) AS working_revision_id,
    CASE WHEN r.id IS NOT NULL AND r.id<>p.working_revision_id THEN json_extract(r.properties_json,'$.ownerMemberId') ELSE p.owner_member_id END AS owner_member_id,
    CASE WHEN r.id IS NOT NULL AND r.id<>p.working_revision_id THEN r.created_at ELSE p.updated_at END AS updated_at
    FROM json_each(?2) requested JOIN pages p ON p.id=json_extract(requested.value,'$.id') AND p.workspace_id=?3 AND p.deleted_at IS NULL
    LEFT JOIN page_revisions r ON r.id=json_extract(requested.value,'$.revisionId') AND r.page_id=p.id AND r.deleted_at IS NULL
    WHERE json_extract(requested.value,'$.revisionId') IS NULL OR r.id IS NOT NULL
    ) SELECT p.id,${pageTrustStateSql('p', 'v', '?1')} AS state,
    m.id AS ownerId,m.display_name AS ownerName,
    CASE WHEN v.status_key IS p.status_key THEN v.expires_at END AS expiresAt,p.updated_at AS updatedAt
    FROM projected p
    LEFT JOIN page_verifications v ON v.id=${latestVerificationSql('p')}
    LEFT JOIN members m ON m.id=CASE WHEN v.id IS NOT NULL AND v.status_key IS p.status_key THEN v.owner_member_id ELSE p.owner_member_id END AND m.workspace_id=p.workspace_id`)
    .bind(ctx.now, JSON.stringify(requested), ctx.actor.workspaceId)
    .all<{ id: string; state: PageTrust['state']; ownerId: string | null; ownerName: string | null; expiresAt: string | null; updatedAt: string }>();
  return new Map(rows.results.map(row => [row.id, { state: row.state, owner: row.ownerId ? { id: row.ownerId, displayName: row.ownerName! } : null, expiresAt: row.expiresAt, updatedAt: row.updatedAt }]));
}
