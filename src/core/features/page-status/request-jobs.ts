import './request-integration';
import type { FeatureContext } from '../../app/feature-context';
import { commitOperation, mutationGuard } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { currentSubject } from '../sharing/current-access';
import { notificationStatements } from '../notifications/events';
import { pageReadableSql } from '../notifications/creation-access';
import { assignedSql } from './request-access';

export interface ReviewJob { requestId: string; assignmentGeneration: number; stage: 'reviewer' | 'owner' }
/** Selection is a hint; the prepared batch rechecks stage, revision, assignment and ACL. */
export async function prepareReviewJobs(ctx: FeatureContext, limit = 100): Promise<ReviewJob[]> {
 const rows = await ctx.db.prepare(`SELECT r.id AS requestId,r.assignment_generation AS assignmentGeneration,
 CASE WHEN reviewer.created_at IS NULL THEN 'reviewer' ELSE 'owner' END AS stage
 FROM review_requests r JOIN pages p ON p.id=r.page_id
 LEFT JOIN review_request_deliveries reviewer ON reviewer.request_id=r.id AND reviewer.assignment_generation=r.assignment_generation AND reviewer.stage='reviewer'
 WHERE r.workspace_id=?1 AND r.state='pending' AND r.dispatch_paused_at IS NULL AND r.due_at<=?2
 AND p.deleted_at IS NULL AND p.trashed_at IS NULL AND p.archived_at IS NULL AND p.lifecycle<>'archived'
 AND (reviewer.created_at IS NULL OR reviewer.created_at<=?3 AND NOT EXISTS(SELECT 1 FROM review_request_deliveries owner WHERE owner.request_id=r.id AND owner.assignment_generation=r.assignment_generation AND owner.stage='owner'))
 ORDER BY r.due_at,r.id LIMIT ?4`).bind(ctx.actor.workspaceId, ctx.now, new Date(Date.parse(ctx.now) - 86400000).toISOString(), Math.min(100, Math.max(1, Math.trunc(limit)))).all<ReviewJob>();
 return rows.results;
}
export async function prepareReviewJob(ctx: FeatureContext, job: ReviewJob) {
 const row = await ctx.db.prepare('SELECT page_id,revision_id FROM review_requests WHERE id=? AND workspace_id=?').bind(job.requestId, ctx.actor.workspaceId).first<{page_id: string; revision_id: string}>();
 if (!row) return null;
 const recipients = await ctx.db.prepare(`SELECT m.id FROM members m JOIN review_requests r ON r.id=?1 WHERE m.workspace_id=r.workspace_id AND m.status='active' AND
 (${job.stage === 'owner' ? 'EXISTS(SELECT 1 FROM pages p JOIN container_owners co ON co.container_id=p.container_id WHERE p.id=r.page_id AND co.member_id=m.id)' : assignedSql('m')})
 AND ${pageReadableSql('m', 'r.page_id', 'r.workspace_id', '?2')} ORDER BY m.id`).bind(job.requestId, ctx.now).all<{id: string}>();
 if (!recipients.results.length) return null;
 const eligibleStage = job.stage === 'reviewer' ? `r.due_at<=? AND NOT EXISTS(SELECT 1 FROM review_request_deliveries d WHERE d.request_id=r.id AND d.assignment_generation=r.assignment_generation AND d.stage='reviewer')`
 : `EXISTS(SELECT 1 FROM review_request_deliveries d WHERE d.request_id=r.id AND d.assignment_generation=r.assignment_generation AND d.stage='reviewer' AND d.created_at<=?) AND NOT EXISTS(SELECT 1 FROM review_request_deliveries d WHERE d.request_id=r.id AND d.assignment_generation=r.assignment_generation AND d.stage='owner')`;
 const cutoff = job.stage === 'reviewer' ? ctx.now : new Date(Date.parse(ctx.now) - 86400000).toISOString();
 return { pageId: row.page_id, statements: [
  mutationGuard(ctx.db, `SELECT r.state='pending' AND r.dispatch_paused_at IS NULL AND r.assignment_generation=? AND r.revision_id=? AND ${eligibleStage} AND p.deleted_at IS NULL AND p.trashed_at IS NULL AND p.archived_at IS NULL AND p.lifecycle<>'archived' FROM review_requests r JOIN pages p ON p.id=r.page_id WHERE r.id=? AND r.workspace_id=?`, [job.assignmentGeneration, row.revision_id, cutoff, job.requestId, ctx.actor.workspaceId]),
  ctx.db.prepare('INSERT INTO review_request_deliveries(request_id,assignment_generation,stage,created_at) VALUES(?,?,?,?)').bind(job.requestId, job.assignmentGeneration, job.stage, ctx.now),
  ...notificationStatements(ctx, { id: `review:${job.requestId}:${job.assignmentGeneration}:${job.stage}`, event: job.stage === 'reviewer' ? 'review-overdue' : 'review-escalated', pageId: row.page_id, actorId: null, recipientIds: recipients.results.map(r => r.id), detail: { reviewRequestId: job.requestId, assignmentGeneration: job.assignmentGeneration, reviewStage: job.stage } }),
 ] };
}
/** One receipt and durable stage identity make concurrent cron/queue invocations harmless. */
export async function dispatchReviewRequests(ctx: FeatureContext, limit = 100) {
 let processed = 0;
 for (const job of await prepareReviewJobs(ctx, limit)) {
  try {
   // Do not consume the stage when no current recipient can read the page.
   if (!await prepareReviewJob(ctx, job)) continue;
   await commitOperation(ctx, { operationKey: `review-job:${job.requestId}:${job.assignmentGeneration}:${job.stage}`, action: 'review.reminder', request: job,
    authorize: async () => { await currentSubject(ctx); }, prepare: async ({ revisionId }) => {
     const plan = await prepareReviewJob(ctx, job);
     if (!plan) throw new ApiProblem(409, 'REVISION_CONFLICT', 'Review recipients changed.');
     return { statements: plan.statements, entity: { id: job.requestId, kind: 'review-request', revisionId }, value: job };
    } });
   processed++;
  } catch (error) {
   if (error instanceof ApiProblem && (error.code === 'REVISION_CONFLICT' || error.code === 'ENTITY_CONFLICT')) continue;
   throw error;
  }
 }
 return { processed };
}
