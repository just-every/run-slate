import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { currentSubject, requireContainerLevel, resolveCurrentAccessMany } from '../sharing/current-access';
import { publishedImportContainerSql } from '../imports/publication';
import type { ReportScopes } from './report-types';

export async function reportScopes(ctx: FeatureContext): Promise<ReportScopes> {
  const subject = await currentSubject(ctx);
  if (subject.isGuest) return { workspace: false, containers: [] };
  const workspace = !!await ctx.db.prepare("SELECT 1 FROM members WHERE id=? AND workspace_id=? AND role='owner' AND status='active' AND member_kind='member'").bind(ctx.actor.id, ctx.actor.workspaceId).first();
  const containers = (await ctx.db.prepare(`SELECT c.id,c.name FROM containers c WHERE c.workspace_id=? AND c.trashed_at IS NULL AND ${publishedImportContainerSql('c.id')}
    AND (EXISTS(SELECT 1 FROM container_owners o WHERE o.container_id=c.id AND o.member_id=?) OR (?=1 AND c.visibility<>'personal')) ORDER BY c.name,c.id`)
    .bind(ctx.actor.workspaceId, ctx.actor.id, +workspace).all<{ id: string; name: string }>()).results;
  return { workspace, containers };
}

export async function reportContainers(ctx: FeatureContext, containerId?: string) {
  const scopes = await reportScopes(ctx);
  if (containerId) {
    if (!scopes.containers.some(c => c.id === containerId)) throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
    // Ownership authorizes the report, never a generic full-access grant.
    if (!scopes.workspace) await requireContainerLevel(ctx, containerId, 'view');
    return scopes.containers.filter(c => c.id === containerId);
  }
  if (!scopes.workspace && !scopes.containers.length) throw new ApiProblem(403, 'FORBIDDEN', 'Workspace or space ownership is required.');
  return scopes.containers;
}

export async function readableReportPages(ctx: FeatureContext, ids: string[]) {
  const readable = new Set<string>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const access = await resolveCurrentAccessMany(ctx, ids.slice(offset, offset + 100));
    for (const [id, value] of access) if (value.decision.allowed) readable.add(id);
  }
  return readable;
}
