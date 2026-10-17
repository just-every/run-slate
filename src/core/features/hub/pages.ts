import type { FeatureContext } from '../../app/feature-context';
import { loadPageTrust } from '../search/trust';
import { currentSubject, resolveCurrentAccessMany } from '../sharing/current-access';
import type { HubPage } from './types';

interface PageRow {
  id:string; title:string; icon:string|null; containerId:string; containerName:string;
  workingRevisionId:string; publishedRevisionId:string|null; publishedProperties:string|null; isPost:number;
}

/** Read fresh authority and immutable reader-visible titles. No page body enters hub data. */
export async function hubPages(ctx: FeatureContext, ids?: readonly string[]): Promise<HubPage[]> {
  const subject = await currentSubject(ctx);
  if (ids?.length === 0) return [];
  const rows = (await ctx.db.prepare(`SELECT p.id,p.title,p.icon,p.container_id AS containerId,c.name AS containerName,
    p.working_revision_id AS workingRevisionId,p.published_revision_id AS publishedRevisionId,r.properties_json AS publishedProperties,
    EXISTS(SELECT 1 FROM blog_posts b WHERE b.page_id=p.id) AS isPost
    FROM pages p JOIN containers c ON c.id=p.container_id
    LEFT JOIN page_revisions r ON r.page_id=p.id AND r.id=p.published_revision_id AND r.deleted_at IS NULL
    WHERE p.workspace_id=? AND p.deleted_at IS NULL AND p.archived_at IS NULL AND p.trashed_at IS NULL
      AND c.archived_at IS NULL AND c.trashed_at IS NULL AND p.lifecycle IN ('live','live-with-unpublished-changes')
      AND (? IS NULL OR p.id IN (SELECT value FROM json_each(?)))`)
    .bind(ctx.actor.workspaceId, ids ? JSON.stringify(ids) : null, ids ? JSON.stringify(ids) : null).all<PageRow>()).results;
  const access = await resolveCurrentAccessMany(ctx, rows.map(p => p.id), {subject});
  const readable = rows.filter(p => access.get(p.id)?.decision.allowed);
  const trust = await loadPageTrust(ctx, readable.map(p => p.id));
  return readable.flatMap(p => {
    const level = access.get(p.id)!.decision.level;
    const publishedOnly = (level === 'view' || level === 'comment') && p.publishedRevisionId && p.publishedRevisionId !== p.workingRevisionId;
    if (publishedOnly && !p.publishedProperties) return [];
    const properties = publishedOnly ? JSON.parse(p.publishedProperties!) : p;
    return [{id:p.id,title:properties.title,icon:properties.icon,containerId:p.containerId,containerName:p.containerName,isPost:!!p.isPost,
      // A key page must be current, and its reader must receive that same verified revision.
      verified:!publishedOnly && trust.get(p.id)?.state === 'verified'}];
  }).sort((a,b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}
