import type { FeatureContext } from '../../app/feature-context';
import { registerNotificationCreationEligibility, type NotificationFact } from '../notifications/events';
import { registerNotificationVisibility } from '../notifications/visibility';
import type { NotificationDetail } from '../notifications/visibility';
import { assignedSql } from './request-access';

/** Both insertion and every later delivery recheck the current assignment and stage. */
export function reviewNotificationEligibility(member: string, fact: Pick<NotificationFact, 'event' | 'detail'>) {
 const detail = fact.detail, stage = detail?.reviewStage;
 const expected = fact.event === 'review-requested' ? 'assigned' : fact.event === 'review-overdue' ? 'reviewer' : fact.event === 'review-escalated' ? 'owner' : null;
 if (!detail?.reviewRequestId || !Number.isInteger(detail.assignmentGeneration) || !expected || stage !== expected) return { sql: '0', values: [] };
 const recipient = stage === 'owner' ? `EXISTS(SELECT 1 FROM pages rp JOIN container_owners co ON co.container_id=rp.container_id WHERE rp.id=r.page_id AND co.member_id=${member}.id)` : assignedSql(member);
 return { sql: `EXISTS(SELECT 1 FROM review_requests r JOIN pages rp ON rp.id=r.page_id WHERE r.id=? AND r.assignment_generation=? AND r.workspace_id=${member}.workspace_id AND r.state='pending' AND r.dispatch_paused_at IS NULL AND rp.deleted_at IS NULL AND rp.trashed_at IS NULL AND rp.archived_at IS NULL AND rp.lifecycle<>'archived' AND EXISTS(SELECT 1 FROM review_request_deliveries rd WHERE rd.request_id=r.id AND rd.assignment_generation=r.assignment_generation AND rd.stage=?) AND (${recipient}))`, values: [detail.reviewRequestId, detail.assignmentGeneration!, expected] };
}
async function visible(ctx: FeatureContext, event: NotificationFact['event'], detail: NotificationDetail) {
 const eligible = reviewNotificationEligibility('m', { event, detail });
 const row = await ctx.db.prepare(`SELECT 1 FROM members m WHERE m.id=? AND m.workspace_id=? AND m.status='active' AND (${eligible.sql})`).bind(ctx.actor.id, ctx.actor.workspaceId, ...eligible.values).first();
 return !!row;
}
for (const event of ['review-requested', 'review-overdue', 'review-escalated'] as const) {
 registerNotificationCreationEligibility(event, (member, fact) => reviewNotificationEligibility(member, fact));
 registerNotificationVisibility(event, (ctx, detail) => visible(ctx, event, detail));
}
