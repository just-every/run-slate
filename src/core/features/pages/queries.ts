import type { FeatureContext } from '../../app/feature-context';
import { requirePageLevel } from '../sharing/current-access';
import { commitOperation } from '../../app/operations';
export {contentQuery} from './content-query';
export async function treeExpansion(ctx: FeatureContext, pageId: string, input?: {
    operationKey: string;
    expanded: boolean;
}) {
    await requirePageLevel(ctx, pageId, 'view');
    if (!input) {
        const row = await ctx.db.prepare('SELECT expanded FROM content_tree_expansion WHERE member_id=? AND page_id=?').bind(ctx.actor.id, pageId).first<{
            expanded: number;
        }>();
        return { expanded: !!row?.expanded };
    }
    return commitOperation(ctx, { operationKey: input.operationKey, action: 'pages.expansion', request: { pageId, ...input }, authorize: async () => { await requirePageLevel(ctx, pageId, 'view'); }, prepare: async ({ revisionId }) => ({ statements: [ctx.db.prepare('INSERT INTO content_tree_expansion VALUES (?,?,?,?) ON CONFLICT(member_id,page_id) DO UPDATE SET expanded=excluded.expanded,updated_at=excluded.updated_at').bind(ctx.actor.id, pageId, +input.expanded, ctx.now)], entity: { id: pageId, kind: 'page', revisionId }, value: { expanded: input.expanded } }) });
}
