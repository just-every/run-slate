import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { commitOperation, mutationGuard, requestHash } from '../../app/operations';
import { requirePageLevel } from '../sharing/current-access';
import { requireGrant } from '../effects/grants';
import { pageRow, snapshot, pageGuard } from '../pages/repository';
import { prepareRestorePage } from '../lifecycle/service';
/** Machines use this entrypoint; it can never issue a human verification. */
export async function acceptGrantedSuggestion(ctx: FeatureContext, id: string, input: {
    operationKey: string;
    grantId: string;
}) {
    const s = await ctx.db.prepare('SELECT * FROM content_suggestions WHERE id=?').bind(id).first<Record<string, any>>();
    if (!s)
        throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
    const hash = await requestHash({ revisionId: s.revision_id, blocks: JSON.parse(s.patch_json) });
    const authorize = async () => { await requirePageLevel(ctx, s.page_id, 'edit'); await requireGrant(ctx, input.grantId, { kind: 'effect', operation: 'page.maintain', target: s.page_id, sourceIds: [s.page_id], audience: ['workspace'], costMicros: 0, contentHash: hash, conditions: { revisionId: s.revision_id } }); };
    return commitOperation(ctx, { operationKey: input.operationKey, action: 'suggestions.granted-accept', request: { id, ...input }, authorize, prepare: async ({ revisionId }) => { const g = await requireGrant(ctx, input.grantId, { kind: 'effect', operation: 'page.maintain', target: s.page_id, sourceIds: [s.page_id], audience: ['workspace'], costMicros: 0, contentHash: hash, conditions: { revisionId: s.revision_id } }), p = await pageRow(ctx, s.page_id), snap = await snapshot(ctx, p); const plan = await prepareRestorePage(ctx, p.id, s.revision_id, revisionId, JSON.parse(s.patch_json).map((b: any) => ({ ...b, pageId: p.id, parentBlockId: b.parentBlockId ?? null, revisionId })), snap.properties, `granted-suggestion:${id}`); plan.statements.unshift(mutationGuard(ctx.db, 'SELECT revision_id=? AND revoked_at IS NULL AND expires_at>? FROM intelligence_grants WHERE id=?', [g.row.revision_id, ctx.now, g.row.id]), mutationGuard(ctx.db, "SELECT state='pending' FROM content_suggestions WHERE id=?", [id])); plan.statements.push(ctx.db.prepare("UPDATE content_suggestions SET state='accepted',decided_by_member_id=?,decided_at=? WHERE id=?").bind(ctx.actor.id, ctx.now, id)); return plan; } });
}
