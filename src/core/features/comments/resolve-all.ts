import type { FeatureContext } from '../../app/feature-context';
import { commitOperation, mutationGuard } from '../../app/operations';
import { requirePageLevel } from '../sharing/current-access';
import { pageRow, lifecycleWritable, lifecyclePageGuard } from '../pages/repository';
import { createUlid } from '../../shared/ulid';
import { requestHash } from '../../app/operations';
export async function resolveAllThreads(ctx: FeatureContext, pageId: string, input: {
    operationKey: string;
}) {
    return commitOperation(ctx, { operationKey: input.operationKey, action: 'comments.resolve-all', request: { pageId, ...input }, authorize: async () => { await requirePageLevel(ctx, pageId, 'comment'); }, prepare: async ({ revisionId }) => {
            const page=await pageRow(ctx,pageId);
            lifecycleWritable(page);
            const threads = (await ctx.db.prepare("SELECT id,revision_id FROM comment_threads WHERE page_id=? AND state='open'").bind(pageId).all<{
                id: string;
                revision_id: string;
            }>()).results;
            const statements: D1PreparedStatement[] = [lifecyclePageGuard(ctx,page)];
            for (const thread of threads) {
                const rev = createUlid();
                statements.push(mutationGuard(ctx.db, 'SELECT revision_id=? FROM comment_threads WHERE id=?', [thread.revision_id, thread.id]), ctx.db.prepare("UPDATE comment_threads SET state='resolved',resolved_at=?,resolved_by_member_id=?,revision_id=?,updated_at=? WHERE id=?").bind(ctx.now, ctx.actor.id, rev, ctx.now, thread.id), ctx.db.prepare('INSERT INTO record_revisions (id,workspace_id,entity_kind,entity_id,content_hash,content_json,author_member_id,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(rev, ctx.actor.workspaceId, 'comment-thread', thread.id, await requestHash({ resolved: true, rev }), JSON.stringify({ resolved: true }), ctx.actor.id, ctx.now));
            }
            return { statements, entity: { id: pageId, kind: 'page', revisionId }, value: { resolved: threads.map(t => t.id) } };
        } });
}
