import type { FeatureContext } from '../../app/feature-context';
import { commitOperation, mutationGuard } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { createUlid } from '../../shared/ulid';
import { requirePageLevel } from '../sharing/current-access';
import { pageRow, pageGuard, snapshot } from '../pages/repository';
import { validateBlockTree } from '../editor/validation';
import type { BlockInput } from '../pages/types';
import { prepareRestorePage } from '../lifecycle/service';
export async function suggestEdits(ctx: FeatureContext, pageId: string, input: {
    operationKey: string;
    expectedRevisionId: string;
    blocks: BlockInput[];
}) { const blocks = validateBlockTree(input.blocks); return commitOperation(ctx, { operationKey: input.operationKey, action: 'suggestions.create', request: { pageId, ...input }, authorize: async () => { await requirePageLevel(ctx, pageId, 'comment'); }, prepare: async ({ revisionId }) => { const p = await pageRow(ctx, pageId), id = createUlid(); return { statements: [pageGuard(ctx, p, input.expectedRevisionId), ctx.db.prepare("INSERT INTO content_suggestions (id,page_id,revision_id,proposed_by_member_id,patch_json,state,created_at) VALUES (?,?,?,?,?,'pending',?)").bind(id, pageId, p.revision_id, ctx.actor.id, JSON.stringify(blocks), ctx.now)], entity: { id, kind: 'suggestion', revisionId }, value: { id, pageId, revisionId: p.revision_id, state: 'pending' } }; } }); }
export async function decideSuggestion(ctx: FeatureContext, id: string, input: {
    operationKey: string;
    accept: boolean;
}) {
    const s = await ctx.db.prepare('SELECT * FROM content_suggestions WHERE id=?').bind(id).first<Record<string, any>>();
    if (!s)
        throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
    return commitOperation(ctx, { operationKey: input.operationKey, action: 'suggestions.decide', request: { id, ...input }, authorize: async () => { await requirePageLevel(ctx, s.page_id, 'edit'); }, prepare: async ({ revisionId }) => {
            const p = await pageRow(ctx, s.page_id);
            if (s.state !== 'pending')
                throw new ApiProblem(409, 'SUGGESTION_DECIDED', 'This suggestion is already decided.');
            const statements = [mutationGuard(ctx.db, "SELECT state='pending' FROM content_suggestions WHERE id=?", [id])];
            if (input.accept) {
                statements.push(pageGuard(ctx, p, s.revision_id));
                const snap = await snapshot(ctx, p);
                const plan = await prepareRestorePage(ctx, p.id, s.revision_id, revisionId, JSON.parse(s.patch_json).map((b: BlockInput) => ({ ...b, pageId: p.id, parentBlockId: b.parentBlockId ?? null, revisionId })), snap.properties, `suggestion:${id}`);
                statements.push(...plan.statements);
            }
            statements.push(ctx.db.prepare('UPDATE content_suggestions SET state=?,decided_by_member_id=?,decided_at=? WHERE id=?').bind(input.accept ? 'accepted' : 'rejected', ctx.actor.id, ctx.now, id));
            return { statements, entity: { id: p.id, kind: 'page', revisionId: input.accept ? revisionId : p.revision_id }, value: { id, state: input.accept ? 'accepted' : 'rejected', revisionId: input.accept ? revisionId : p.revision_id } };
        } });
}
