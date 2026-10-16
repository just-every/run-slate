import type { FeatureContext } from '../core/app/feature-context';
import { commitOperation, mutationGuard } from '../core/app/operations';
import { requireWorkspaceOwner } from '../core/features/sharing/current-access';
import { firstRunRecords } from '../core/features/workspace/first-run-records';

/** Demo content has its own receipt; a claimed workspace has already finished first run. */
export async function seedDemoWorkspace(ctx: FeatureContext) {
  return commitOperation(ctx, {
    operationKey: 'demo:first-run', action: 'demo.workspace',
    request: { workspaceName: 'Slate', containerName: 'Team handbook', pageTitle: 'Welcome to Northstar' },
    authorize: () => requireWorkspaceOwner(ctx),
    prepare: async ({ revisionId }) => {
      const initial = await firstRunRecords(ctx, { containerName: 'Team handbook', pageTitle: 'Welcome to Northstar' }, revisionId);
      return {
        entity: { id: ctx.actor.workspaceId, kind: 'workspace', revisionId },
        value: { containerId: initial.containerId, pageId: initial.pageId },
        statements: [
          mutationGuard(ctx.db, 'SELECT is_setup_owner=1 FROM members WHERE id=?', [ctx.actor.id]),
          ctx.db.prepare('UPDATE workspaces SET name=?,updated_at=?,revision_id=?,first_run_completed_at=COALESCE(first_run_completed_at,?) WHERE id=?')
            .bind('Slate', ctx.now, revisionId, ctx.now, ctx.actor.workspaceId),
          ...initial.statements,
        ],
      };
    },
  });
}
