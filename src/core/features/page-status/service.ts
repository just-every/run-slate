import type { FeatureContext } from '../../app/feature-context';
import { commitOperation } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { createUlid } from '../../shared/ulid';
import { requirePageLevel, requireWorkspaceOwner } from '../sharing/current-access';
import { pageRow, pageGuard, snapshot, revisionStatement, contentEvent, writable } from '../pages/repository';
export async function setPageStatus(ctx: FeatureContext, id: string, input: {
    operationKey: string;
    expectedRevisionId: string;
    statusKey: string | null;
    attestRevisionId?: string;
    expiresAt?: string | null;
}) {
    return commitOperation(ctx, { operationKey: input.operationKey, action: 'pages.status', request: { id, ...input }, authorize: async () => { await requirePageLevel(ctx, id, 'edit'); }, prepare: async ({ revisionId }) => {
            const p = await pageRow(ctx, id);
            writable(p);
            const status = input.statusKey ? await ctx.db.prepare('SELECT * FROM status_entries WHERE workspace_id=? AND key=? AND retired_at IS NULL').bind(ctx.actor.workspaceId, input.statusKey).first<{
                requires_verification: number;
            }>() : null;
            if (input.statusKey && !status)
                throw new ApiProblem(400, 'UNKNOWN_STATUS', 'Choose an active status.');
            const s = await snapshot(ctx, p);
            s.properties.statusKey = input.statusKey;
            const statements = [pageGuard(ctx, p, input.expectedRevisionId)];
            if (status?.requires_verification) {
                if (input.attestRevisionId !== p.working_revision_id)
                    throw new ApiProblem(409, 'EXACT_REVISION_REQUIRED', 'Open the exact current revision before attesting.');
                const opened = await ctx.db.prepare('SELECT 1 FROM content_page_opens WHERE member_id=? AND page_id=? AND revision_id=?').bind(ctx.actor.id, id, input.attestRevisionId).first();
                if (!opened)
                    throw new ApiProblem(409, 'REVISION_NOT_OPENED', 'Open this revision before human verification.');
                if (input.expiresAt && (!Number.isFinite(Date.parse(input.expiresAt)) || input.expiresAt <= ctx.now))
                    throw new ApiProblem(400, 'INVALID_EXPIRY', 'Expiry must be in the future.');
                statements.push(ctx.db.prepare('INSERT INTO page_verifications (id,page_id,revision_id,status_key,owner_member_id,verified_by_member_id,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(createUlid(), id, p.working_revision_id, input.statusKey, ctx.actor.id, ctx.actor.id, input.expiresAt ?? null, ctx.now));
            }
            statements.push(ctx.db.prepare('UPDATE pages SET status_key=?,revision_id=?,updated_at=? WHERE id=?').bind(input.statusKey, revisionId, ctx.now, id), await revisionStatement(ctx, id, revisionId, s), contentEvent(ctx, id, revisionId, 'status'));
            return { statements, entity: { id, kind: 'page', revisionId }, value: { pageId: id, revisionId } };
        } });
}
export async function verification(ctx: FeatureContext, pageId: string) { await requirePageLevel(ctx, pageId, 'view'); const p = await pageRow(ctx, pageId); const v = await ctx.db.prepare('SELECT * FROM page_verifications WHERE page_id=? ORDER BY created_at DESC,id DESC LIMIT 1').bind(pageId).first<Record<string, any>>(); return v ? { ...v, lapsed: !!v.expires_at && v.expires_at <= ctx.now, current: v.revision_id === p.working_revision_id && (!v.expires_at || v.expires_at > ctx.now) } : null; }
export async function setStatusEntry(ctx: FeatureContext, input: {
    operationKey: string;
    key: string;
    label: string;
    color: string;
    requiresVerification: boolean;
    retire?: boolean;
}) {
    if (!input.key || !input.label || input.label.length > 20 || !/^#[0-9a-fA-F]{6}$/.test(input.color))
        throw new ApiProblem(400, 'INVALID_STATUS', 'Status needs a key, a label of at most twenty characters and a hex colour.');
    return commitOperation(ctx, { operationKey: input.operationKey, action: 'status.vocabulary', request: input, authorize: () => requireWorkspaceOwner(ctx), prepare: async ({ revisionId }) => ({ statements: [ctx.db.prepare('INSERT INTO status_entries (id,workspace_id,key,label,color,requires_verification,retired_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,key) DO UPDATE SET label=excluded.label,color=excluded.color,requires_verification=excluded.requires_verification,retired_at=excluded.retired_at,updated_at=excluded.updated_at').bind(createUlid(), ctx.actor.workspaceId, input.key, input.label, input.color, +input.requiresVerification, input.retire ? ctx.now : null, ctx.now, ctx.now)], entity: { id: input.key, kind: 'status', revisionId }, value: { key: input.key, revisionId } }) });
}
