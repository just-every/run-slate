import type { FeatureContext } from '../../app/feature-context';
import { commitOperation, mutationGuard } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { createUlid } from '../../shared/ulid';
import { requirePageLevel, requireWorkspaceOwner } from '../sharing/current-access';
import { pageRow, pageGuard, snapshot, revisionStatement, contentEvent, writable } from '../pages/repository';
import { verificationExpiry, verificationState } from './state';
import { prepareVerifiedRequest } from './requests';
import { bulkReviewOwner } from './request-queue';
import { requestRow, requireAssignee } from './request-access';
export async function setPageStatus(ctx: FeatureContext, id: string, input: {
    operationKey: string;
    expectedRevisionId: string;
    statusKey: string | null;
    attestRevisionId?: string;
    /** STAT-003: 7, 30 or 90 days from the server's clock, or `expiresAt`, or neither for no expiry. */
    expiresInDays?: number | null;
    expiresAt?: string | null;
    bulkReview?: boolean;
    reviewRequest?: { id: string; assignmentGeneration: number; expectedRevisionId: string };
}) {
    return commitOperation(ctx, { operationKey: input.operationKey, action: 'pages.status', request: { id, ...input }, authorize: async () => { await requirePageLevel(ctx, id, 'edit'); if (input.reviewRequest) { const request = await requestRow(ctx, input.reviewRequest.id); if (request.page_id !== id) throw new ApiProblem(404, 'NOT_FOUND', 'Not found.'); await requireAssignee(ctx, request, 'edit'); } if (input.bulkReview && !await bulkReviewOwner(ctx, id)) throw new ApiProblem(403, 'REVIEW_OWNER_REQUIRED', 'Bulk verification requires a workspace or container owner.'); }, prepare: async ({ revisionId }) => {
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
            if ((input.reviewRequest || input.bulkReview) && !status?.requires_verification) throw new ApiProblem(400, 'VERIFICATION_STATUS_REQUIRED', 'Complete a review with a human verification status.');
            if (status?.requires_verification) {
                if (input.attestRevisionId !== p.working_revision_id)
                    throw new ApiProblem(409, 'EXACT_REVISION_REQUIRED', 'Someone changed this page after you opened it. Reload the page, read the current version, then verify it.');
                const opened = await ctx.db.prepare('SELECT 1 FROM content_page_opens WHERE member_id=? AND page_id=? AND revision_id=?').bind(ctx.actor.id, id, input.attestRevisionId).first();
                if (!opened)
                    throw new ApiProblem(409, 'REVISION_NOT_OPENED', 'Slate could not confirm the visit to this revision. Refresh this page, review the current content, then verify it again.');
                statements.push(mutationGuard(ctx.db, 'SELECT working_revision_id=? AND EXISTS(SELECT 1 FROM content_page_opens o WHERE o.member_id=? AND o.page_id=pages.id AND o.revision_id=?) FROM pages WHERE id=?', [input.attestRevisionId, ctx.actor.id, input.attestRevisionId, id]));
                if (input.reviewRequest) statements.push(...await prepareVerifiedRequest(ctx, id, input.reviewRequest, revisionId));
                const expiresAt = verificationExpiry(input, ctx.now);
                statements.push(ctx.db.prepare('INSERT INTO page_verifications (id,page_id,revision_id,status_key,owner_member_id,verified_by_member_id,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(createUlid(), id, p.working_revision_id, input.statusKey, ctx.actor.id, ctx.actor.id, expiresAt, ctx.now));
            }
            statements.push(ctx.db.prepare('UPDATE pages SET status_key=?,revision_id=?,updated_at=? WHERE id=?').bind(input.statusKey, revisionId, ctx.now, id), await revisionStatement(ctx, id, revisionId, s), ...contentEvent(ctx, id, revisionId, 'status'));
            return { statements, entity: { id, kind: 'page', revisionId }, value: { pageId: id, revisionId } };
        } });
}
/** The page's latest verification as its badge and panel show it (STAT-003, STAT-004). */
export async function verification(ctx: FeatureContext, pageId: string) {
    const access = await requirePageLevel(ctx, pageId, 'view');
    const p = await pageRow(ctx, pageId);
    const v = await ctx.db.prepare("SELECT v.*,m.display_name AS verifier_name,m.status='active' AS verifier_active,r.created_at AS revision_created_at FROM page_verifications v LEFT JOIN members m ON m.id=v.owner_member_id LEFT JOIN page_revisions r ON r.id=v.revision_id WHERE v.page_id=? ORDER BY v.created_at DESC,v.id DESC LIMIT 1").bind(pageId).first<Record<string, any>>();
    if (!v)
        return null;
    const { verifier_name, verifier_active, revision_created_at, ...row } = v;
    const state = verificationState(v as { status_key: string; revision_id: string; expires_at: string | null }, p, ctx.now);
    const changedSince = v.revision_id !== p.working_revision_id;
    const opened = await ctx.db.prepare('SELECT 1 FROM content_page_opens WHERE member_id=? AND page_id=? AND revision_id=?').bind(ctx.actor.id, pageId, p.working_revision_id).first();
    const changes = changedSince ? await changesSince(ctx, pageId, v.created_at, ['edit', 'full'].includes(access.decision.level!)) : { revisions: 0, editors: [] };
    return { ...row, state, current: state === 'current', lapsed: !!v.expires_at && v.expires_at <= ctx.now, changedSince, workingRevisionId: p.working_revision_id, revisionCreatedAt: revision_created_at ?? null, verifier: { id: v.owner_member_id, displayName: verifier_name ?? 'Former member', active: !!verifier_active }, revisionsSince: changes.revisions, editorsSince: changes.editors, openedCurrent: !!opened };
}
/** Revisions committed after a verification, limited to those the reader's history shows (REV-002). */
export async function changesSince(ctx: FeatureContext, pageId: string, since: string, editor: boolean) {
    const row = await ctx.db.prepare("SELECT COUNT(*) AS revisions,(SELECT json_group_array(display_name) FROM (SELECT DISTINCT m.display_name FROM page_revisions x JOIN members m ON m.id=x.author_member_id WHERE x.page_id=?1 AND x.created_at>?2 AND x.deleted_at IS NULL AND (?3 OR EXISTS(SELECT 1 FROM content_published_revisions pv WHERE pv.page_id=x.page_id AND pv.revision_id=x.id)) ORDER BY m.display_name)) AS editors FROM page_revisions r WHERE r.page_id=?1 AND r.created_at>?2 AND r.deleted_at IS NULL AND (?3 OR EXISTS(SELECT 1 FROM content_published_revisions pv WHERE pv.page_id=r.page_id AND pv.revision_id=r.id))").bind(pageId, since, +editor).first<{ revisions: number; editors: string }>();
    return { revisions: row?.revisions ?? 0, editors: JSON.parse(row?.editors ?? '[]') as string[] };
}
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
