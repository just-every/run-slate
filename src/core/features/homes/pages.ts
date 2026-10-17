import type { FeatureContext } from '../../app/feature-context';
import { mutationGuard } from '../../app/operations';
import { publishedImportContainerSql } from '../imports/publication';
import { resolveCurrentAccessMany } from '../sharing/current-access';
import { loadPageTrust } from '../search/trust';
import type { HomePageLink } from './types';

export interface HomePage {
  id: string;
  containerId: string;
  revisionId: string;
  publishedRevisionId: string;
  title: string;
  homeEligible: boolean;
}

/** Titles always come from the published revision, even when its reader can edit. */
export async function readableHomePages(ctx: FeatureContext, ids?: string[], containerId?: string): Promise<HomePage[]> {
  if (ids?.length === 0) return [];
  const rows = (await ctx.db.prepare(`SELECT p.id,p.container_id AS containerId,p.revision_id AS revisionId,
    p.published_revision_id AS publishedRevisionId,r.properties_json AS properties,
    p.page_kind='page' AND json_type(r.properties_json,'$.post') IS NULL AS homeEligible
    FROM pages p JOIN containers c ON c.id=p.container_id
    JOIN page_revisions r ON r.id=p.published_revision_id AND r.page_id=p.id
    WHERE p.workspace_id=? AND p.lifecycle IN ('live','live-with-unpublished-changes')
    AND p.deleted_at IS NULL AND p.trashed_at IS NULL AND p.archived_at IS NULL AND r.deleted_at IS NULL
    AND c.trashed_at IS NULL AND c.archived_at IS NULL AND ${publishedImportContainerSql('c.id')}
    AND NOT EXISTS(SELECT 1 FROM import_native_targets it JOIN federation_imports ij ON ij.id=it.import_id WHERE it.kind='page' AND it.target_id=p.id AND ij.native_published=0)
    ${ids ? 'AND p.id IN (SELECT value FROM json_each(?))' : ''}
    ${containerId ? 'AND p.container_id=?' : ''}
    ORDER BY p.id`).bind(ctx.actor.workspaceId, ...(ids ? [JSON.stringify(ids)] : []), ...(containerId ? [containerId] : []))
    .all<Omit<HomePage, 'title' | 'homeEligible'> & { properties: string; homeEligible: number }>()).results;
  const access = await resolveCurrentAccessMany(ctx, rows.map(row => row.id));
  return rows.flatMap(({ properties, homeEligible, ...row }) => access.get(row.id)?.decision.allowed
    ? [{ ...row, title: JSON.parse(properties).title as string, homeEligible: !!homeEligible }] : []);
}

export const homePageLink = (page: HomePage): HomePageLink => ({ id: page.id, title: page.title, href: `/app/pages/${encodeURIComponent(page.id)}` });

/** A member with no personal grants or group/space memberships must still read the hub. */
export async function workspaceReadablePages(ctx: FeatureContext, pages: HomePage[]): Promise<Set<string>> {
  const access = await resolveCurrentAccessMany(ctx, pages.map(page => page.id), {
    subject: { memberId: '', workspaceId: ctx.actor.workspaceId, status: 'active', isGuest: false, groupIds: [], containerIds: [] },
  });
  return new Set(pages.filter(page => access.get(page.id)?.decision.allowed).map(page => page.id));
}

export async function verifiedHomePages(ctx: FeatureContext, pages: HomePage[]): Promise<Set<string>> {
  const ids = pages.map(page => page.id);
  const [published, current] = await Promise.all([
    loadPageTrust(ctx, ids, new Map(pages.map(page => [page.id, page.publishedRevisionId]))),
    loadPageTrust(ctx, ids),
  ]);
  return new Set(pages.filter(page => published.get(page.id)?.state === 'verified' && current.get(page.id)?.state === 'verified').map(page => page.id));
}

/** Selection and its publication/lifecycle snapshot must survive until the atomic commit. */
export function homePageGuards(ctx: FeatureContext, pages: HomePage[]): D1PreparedStatement[] {
  return pages.map(page => mutationGuard(ctx.db, `SELECT p.revision_id=? AND p.published_revision_id=?
    AND p.lifecycle IN ('live','live-with-unpublished-changes') AND p.deleted_at IS NULL
    AND p.trashed_at IS NULL AND p.archived_at IS NULL AND c.trashed_at IS NULL AND c.archived_at IS NULL
    AND r.deleted_at IS NULL FROM pages p JOIN containers c ON c.id=p.container_id
    JOIN page_revisions r ON r.id=p.published_revision_id AND r.page_id=p.id WHERE p.id=? AND p.workspace_id=?`,
    [page.revisionId, page.publishedRevisionId, page.id, ctx.actor.workspaceId]));
}
