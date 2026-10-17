import type { FeatureContext } from '../../app/feature-context';
import { commitOperation } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { requirePageLevel } from '../sharing/current-access';
import { pageRow, pageAccessGuard, lifecyclePageGuard, lifecycleWritable, contentEvent } from './repository';

export interface PageLockInput { operationKey: string; expectedRevisionId: string }
/** Lock state is operational metadata, never a content revision or an access grant. */
export async function setPageLock(ctx: FeatureContext, pageId: string, input: PageLockInput, locked: boolean) {
  if (!input || typeof input.operationKey !== 'string' || typeof input.expectedRevisionId !== 'string' || !input.expectedRevisionId)
    throw new ApiProblem(400, 'INVALID_REQUEST', 'Supply an operation key and the current page revision.');
  return commitOperation(ctx, {
    operationKey: input.operationKey, action: locked ? 'pages.lock' : 'pages.unlock', request: { pageId, ...input },
    authorize: async () => { await requirePageLevel(ctx, pageId, 'edit'); },
    prepare: async ({ revisionId }) => {
      const page = await pageRow(ctx, pageId);
      lifecycleWritable(page);
      const guards = [pageAccessGuard(ctx, page, input.expectedRevisionId), lifecyclePageGuard(ctx, page)];
      if (!!page.locked_at === locked) return {
        noChange: true, statements: guards, entity: { id: pageId, kind: 'page', revisionId: page.revision_id },
        value: { pageId, revisionId: page.revision_id, locked },
      };
      return {
        statements: [...guards, ctx.db.prepare('UPDATE pages SET locked_at=?,locked_by_member_id=?,revision_id=?,updated_at=? WHERE id=? AND workspace_id=?')
          .bind(locked ? ctx.now : null, locked ? ctx.actor.id : null, revisionId, ctx.now, pageId, ctx.actor.workspaceId),
          ...contentEvent(ctx, pageId, revisionId, locked ? 'locked' : 'unlocked', { previousRevisionId: page.revision_id })],
        entity: { id: pageId, kind: 'page', revisionId }, value: { pageId, revisionId, locked },
        detail: { previousRevisionId: page.revision_id },
      };
    },
  });
}
