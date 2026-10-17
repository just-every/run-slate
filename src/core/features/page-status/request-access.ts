import type { FeatureContext } from '../../app/feature-context';
import { mutationGuard } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { pageRow } from '../pages/repository';
import { can } from '../sharing/access';
import { requirePageLevel } from '../sharing/current-access';
import { pageReadableSql } from '../notifications/creation-access';
import type { ReviewAssignment, ReviewRequestCAS, ReviewRequestRow } from './request-types';

/** Current membership is evaluated in SQL again by notification creation and delivery. */
export function assignedSql(member: string, request = 'r') {
 return `(${request}.assignee_kind='member' AND ${request}.assignee_id=${member}.id OR ${request}.assignee_kind='group' AND EXISTS(SELECT 1 FROM group_members gm JOIN groups rg ON rg.id=gm.group_id WHERE gm.member_id=${member}.id AND gm.group_id=${request}.assignee_id AND rg.workspace_id=${request}.workspace_id))`;
}
export function reviewablePageGuard(ctx: FeatureContext, pageId: string) {
 return mutationGuard(ctx.db, "SELECT deleted_at IS NULL AND trashed_at IS NULL AND archived_at IS NULL AND lifecycle<>'archived' FROM pages WHERE id=? AND workspace_id=?", [pageId, ctx.actor.workspaceId]);
}
export async function reviewablePage(ctx: FeatureContext, pageId: string) {
 const p = await pageRow(ctx, pageId);
 if (p.deleted_at || p.trashed_at || p.archived_at || p.lifecycle === 'archived') throw new ApiProblem(409, 'PAGE_READ_ONLY', 'This page is archived or in trash.');
 return p;
}
/** Being an owner is insufficient when current read access was removed. */
export async function requireRequestManager(ctx: FeatureContext, pageId: string) {
 const access = await requirePageLevel(ctx, pageId, 'view');
 const p = await pageRow(ctx, pageId);
 if (p.owner_member_id !== ctx.actor.id && !can(access.decision, 'edit')) throw new ApiProblem(403, 'REVIEW_MANAGER_REQUIRED', 'A page owner or editor can manage review requests.');
 return p;
}
export async function requestRow(ctx: FeatureContext, id: string) {
 const row = await ctx.db.prepare('SELECT * FROM review_requests WHERE id=? AND workspace_id=?').bind(id, ctx.actor.workspaceId).first<ReviewRequestRow>();
 if (!row) throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
 await requirePageLevel(ctx, row.page_id, 'view');
 return row;
}
export async function requireAssignee(ctx: FeatureContext, row: ReviewRequestRow, level: 'view' | 'comment' | 'edit' = 'view') {
 await requirePageLevel(ctx, row.page_id, level);
 const assigned = await ctx.db.prepare(`SELECT 1 FROM review_requests r JOIN members m ON m.id=? AND m.workspace_id=r.workspace_id AND m.status='active' WHERE r.id=? AND ${assignedSql('m')}`).bind(ctx.actor.id, row.id).first();
 if (!assigned) throw new ApiProblem(403, 'REVIEW_ASSIGNEE_REQUIRED', 'Only the current assigned reviewer can complete this request.');
}
export async function assignmentRecipients(ctx: FeatureContext, pageId: string, input: ReviewAssignment) {
 if (!input || !['member', 'group'].includes(input.assigneeKind) || typeof input.assigneeId !== 'string' || !input.assigneeId) throw new ApiProblem(400, 'INVALID_REVIEWER', 'Choose a named member or group.');
 const rows = await ctx.db.prepare(`SELECT m.id FROM members m WHERE m.workspace_id=?1 AND m.status='active' AND
 (?2='member' AND m.id=?3 OR ?2='group' AND EXISTS(SELECT 1 FROM group_members gm JOIN groups g ON g.id=gm.group_id WHERE gm.member_id=m.id AND g.id=?3 AND g.workspace_id=?1))
 AND ${pageReadableSql('m', '?4', '?1', '?5')} ORDER BY m.id`).bind(ctx.actor.workspaceId, input.assigneeKind, input.assigneeId, pageId, ctx.now).all<{ id: string }>();
 if (!rows.results.length) throw new ApiProblem(400, 'REVIEWER_CANNOT_READ', 'Choose a reviewer who can already read the page. Assignment does not grant access.');
 return rows.results.map(r => r.id);
}
export function requestGuard(ctx: FeatureContext, row: ReviewRequestRow, input: Pick<ReviewRequestCAS, 'assignmentGeneration' | 'expectedRevisionId'>) {
 if (!Number.isInteger(input.assignmentGeneration) || input.assignmentGeneration < 1 || typeof input.expectedRevisionId !== 'string') throw new ApiProblem(400, 'INVALID_REVIEW_REVISION', 'Supply the current request revision and assignment generation.');
 return mutationGuard(ctx.db, "SELECT state='pending' AND assignment_generation=? AND revision_id=? FROM review_requests WHERE id=? AND workspace_id=?", [input.assignmentGeneration, input.expectedRevisionId, row.id, ctx.actor.workspaceId]);
}
