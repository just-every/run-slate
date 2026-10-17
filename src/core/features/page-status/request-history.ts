import type { FeatureContext } from '../../app/feature-context';
/** Append the full durable state after the corresponding mutation, in its batch. */
export function requestHistory(ctx: FeatureContext, requestId: string, revisionId: string, action: string) {
 return ctx.db.prepare(`INSERT INTO review_request_history(id,request_id,assignment_generation,actor_member_id,action,snapshot_json,created_at)
 SELECT ?,r.id,r.assignment_generation,?,?,json_object('pageId',r.page_id,'requesterId',r.requester_member_id,'assigneeKind',r.assignee_kind,'assigneeId',r.assignee_id,'assignmentGeneration',r.assignment_generation,'requestedRevisionId',r.requested_revision_id,'date',r.due_date,'time',r.due_time,'timezone',r.timezone,'dueAt',r.due_at,'note',r.note,'state',r.state,'revisionId',r.revision_id,'commentId',r.comment_id,'resolvedBy',r.resolved_by_member_id,'resolvedAt',r.resolved_at,'dispatchPausedAt',r.dispatch_paused_at),? FROM review_requests r WHERE r.id=? AND r.workspace_id=?`)
 .bind(revisionId, ctx.actor.id, action, ctx.now, requestId, ctx.actor.workspaceId);
}
