import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { mutationGuard } from '../../app/operations';
import { readContainer } from '../containers/queries';
import { requireImportPublication } from '../imports/publication';
import { currentSubject, requireContainerAdministration, requireWorkspaceOwner } from '../sharing/current-access';

export async function isHubOwner(ctx: FeatureContext): Promise<boolean> {
  const subject = await currentSubject(ctx);
  if (subject.isGuest) return false;
  return !!await ctx.db.prepare("SELECT 1 FROM members WHERE id=? AND workspace_id=? AND role='owner' AND status='active' AND member_kind='member'")
    .bind(ctx.actor.id, ctx.actor.workspaceId).first();
}

export async function requireHomeAdministration(ctx: FeatureContext, containerId?: string): Promise<void> {
  if (!containerId) return requireWorkspaceOwner(ctx);
  await requireImportPublication(ctx, containerId);
  await requireContainerAdministration(ctx, containerId);
  const container = await readContainer(ctx, containerId);
  if (container.archivedAt || container.trashedAt) throw new ApiProblem(409, 'CONTAINER_UNAVAILABLE', 'Restore the space before changing its home.');
}

export function homeContainerGuard(ctx: FeatureContext, id: string): D1PreparedStatement {
  return mutationGuard(ctx.db, 'SELECT archived_at IS NULL AND trashed_at IS NULL FROM containers WHERE id=? AND workspace_id=?', [id, ctx.actor.workspaceId]);
}
