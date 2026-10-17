import './request-integration';
import type { FeatureContext } from '../../app/feature-context';
import { commitOperation, mutationGuard } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { createUlid } from '../../shared/ulid';
import { scheduleAt } from '../work-items/time';
import { pageGuard } from '../pages/repository';
import { prepareCreateComment } from '../comments/service';
import { notificationStatements } from '../notifications/events';
import { requirePageLevel } from '../sharing/current-access';
import { requestHistory } from './request-history';
import { assignmentRecipients, requireAssignee, requireRequestManager, requestGuard, requestRow, reviewablePage, reviewablePageGuard } from './request-access';
import type { ReviewAssignment, ReviewDue, ReviewRequestCAS, ReviewRequestInput, ReviewRequestRow } from './request-types';

function due(input: ReviewDue) {
 if (typeof input.note !== 'string' || input.note.length > 4000) throw new ApiProblem(400, 'INVALID_REVIEW_NOTE', 'Use a plain-text note of at most 4,000 characters.');
 if (typeof input.date !== 'string' || typeof input.time !== 'string' || typeof input.timezone !== 'string') throw new ApiProblem(400, 'INVALID_REVIEW_DUE', 'Choose a due date, time and timezone.');
 return scheduleAt(input.date, input.time, input.timezone);
}
function assignedNotice(ctx: FeatureContext, id: string, generation: number, pageId: string, recipients: string[]) {
 return notificationStatements(ctx, { id: `review:${id}:${generation}:assigned`, event: 'review-requested', pageId, recipientIds: recipients, detail: { reviewRequestId: id, assignmentGeneration: generation, reviewStage: 'assigned' } });
}
export async function createReviewRequest(ctx: FeatureContext, pageId: string, input: ReviewRequestInput) {
 const dueAt = due(input);
 return commitOperation(ctx, { operationKey: input.operationKey, action: 'review.requested', request: { pageId, ...input },
 authorize: async () => { await requireRequestManager(ctx, pageId); }, prepare: async ({ revisionId }) => {
  const p = await requireRequestManager(ctx, pageId);
  await reviewablePage(ctx, pageId);
  const recipients = await assignmentRecipients(ctx, pageId, input), id = createUlid();
  return { statements: [pageGuard(ctx, p, input.expectedRevisionId), reviewablePageGuard(ctx, pageId),
   ctx.db.prepare('INSERT INTO review_requests(id,workspace_id,page_id,requester_member_id,assignee_kind,assignee_id,requested_revision_id,due_date,due_time,timezone,due_at,note,revision_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, ctx.actor.workspaceId, pageId, ctx.actor.id, input.assigneeKind, input.assigneeId, p.working_revision_id, input.date, input.time, input.timezone, dueAt, input.note, revisionId, ctx.now, ctx.now),
   requestHistory(ctx, id, revisionId, 'requested'), ctx.db.prepare("INSERT INTO review_request_deliveries VALUES(?,1,'assigned',?)").bind(id, ctx.now), ...assignedNotice(ctx, id, 1, pageId, recipients)],
   entity: { id, kind: 'review-request', revisionId }, value: { id, assignmentGeneration: 1, revisionId } };
 } });
}
async function canManageExisting(ctx: FeatureContext, row: ReviewRequestRow) {
 await requirePageLevel(ctx, row.page_id, 'view');
 if (row.requester_member_id === ctx.actor.id) return [];
 const p = await requireRequestManager(ctx, row.page_id);
 return [pageGuard(ctx, p, p.revision_id)];
}
export async function reassignReviewRequest(ctx: FeatureContext, id: string, input: ReviewRequestCAS & ReviewAssignment & ReviewDue) {
 const row = await requestRow(ctx, id), dueAt = due(input);
 return commitOperation(ctx, { operationKey: input.operationKey, action: 'review.reassigned', request: { id, ...input }, authorize: async () => {
  try { await requireAssignee(ctx, row); }
  catch (error) { if (!(error instanceof ApiProblem) || error.code !== 'REVIEW_ASSIGNEE_REQUIRED') throw error; await canManageExisting(ctx, row); }
 }, prepare: async ({ revisionId }) => {
  const authority: D1PreparedStatement[] = [];
  try { await requireAssignee(ctx, row); }
  catch (error) { if (!(error instanceof ApiProblem) || error.code !== 'REVIEW_ASSIGNEE_REQUIRED') throw error; authority.push(...await canManageExisting(ctx, row)); }
  await reviewablePage(ctx, row.page_id);
  const recipients = await assignmentRecipients(ctx, row.page_id, input), generation = input.assignmentGeneration + 1;
  return { statements: [...authority, requestGuard(ctx, row, input), reviewablePageGuard(ctx, row.page_id), ctx.db.prepare('UPDATE review_requests SET dispatch_paused_at=NULL,assignee_kind=?,assignee_id=?,assignment_generation=?,due_date=?,due_time=?,timezone=?,due_at=?,note=?,revision_id=?,updated_at=? WHERE id=?').bind(input.assigneeKind, input.assigneeId, generation, input.date, input.time, input.timezone, dueAt, input.note, revisionId, ctx.now, id),
   requestHistory(ctx, id, revisionId, 'reassigned'), ctx.db.prepare("INSERT INTO review_request_deliveries VALUES(?,?,'assigned',?)").bind(id, generation, ctx.now), ...assignedNotice(ctx, id, generation, row.page_id, recipients)],
   entity: { id, kind: 'review-request', revisionId }, value: { id, assignmentGeneration: generation, revisionId } };
 } });
}
export async function cancelReviewRequest(ctx: FeatureContext, id: string, input: ReviewRequestCAS) {
 const row = await requestRow(ctx, id);
 return commitOperation(ctx, { operationKey: input.operationKey, action: 'review.cancelled', request: { id, ...input }, authorize: async () => { await canManageExisting(ctx, row); }, prepare: async ({ revisionId }) => ({
  statements: [...await canManageExisting(ctx, row), requestGuard(ctx, row, input), ...resolveRequestStatements(ctx, row, revisionId, 'cancelled')],
  entity: { id, kind: 'review-request', revisionId }, value: { id, revisionId } }) });
}
function resolveRequestStatements(ctx: FeatureContext, row: ReviewRequestRow, revisionId: string, state: 'cancelled' | 'verified' | 'changes_requested', commentId: string | null = null) {
 return [ctx.db.prepare('UPDATE review_requests SET state=?,revision_id=?,comment_id=?,resolved_by_member_id=?,resolved_at=?,updated_at=? WHERE id=?').bind(state, revisionId, commentId, ctx.actor.id, ctx.now, ctx.now, row.id), requestHistory(ctx, row.id, revisionId, state)];
}
export async function requestReviewChanges(ctx: FeatureContext, id: string, input: ReviewRequestCAS & { note: string }) {
 if (typeof input.note !== 'string' || !input.note.trim() || input.note.length > 4000) throw new ApiProblem(400, 'INVALID_REVIEW_NOTE', 'Describe the requested changes in at most 4,000 characters.');
 const row = await requestRow(ctx, id);
 return commitOperation(ctx, { operationKey: input.operationKey, action: 'review.changes_requested', request: { id, ...input }, authorize: () => requireAssignee(ctx, row, 'comment'), prepare: async ({ revisionId }) => {
  // The ordinary comment helper keeps comments available on locked content.
  const comment = await prepareCreateComment(ctx, row.page_id, { body: [{text:input.note}], kind: 'page' }, { revisionId });
  return { statements: [requestGuard(ctx, row, input), ...comment.statements, ...resolveRequestStatements(ctx, row, revisionId, 'changes_requested', comment.value.id)],
   entity: { id, kind: 'review-request', revisionId }, value: { id, revisionId, commentId: comment.value.id, threadId: comment.value.threadId } };
 } });
}
/** Called ONLY by setPageStatus after its exact revision, open, edit and status checks. */
export async function prepareVerifiedRequest(ctx: FeatureContext, pageId: string, input: Omit<ReviewRequestCAS, 'operationKey'> & { id: string }, revisionId: string) {
 const row = await requestRow(ctx, input.id);
 if (row.page_id !== pageId) throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
 await requireAssignee(ctx, row, 'edit');
 return [requestGuard(ctx, row, input), mutationGuard(ctx.db, 'SELECT working_revision_id=? FROM pages WHERE id=?', [(await reviewablePage(ctx, pageId)).working_revision_id, pageId]), ...resolveRequestStatements(ctx, row, revisionId, 'verified')];
}
