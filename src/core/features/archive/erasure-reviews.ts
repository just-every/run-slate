import type {FeatureContext} from '../../app/feature-context';

/** Retain access-scoped activity tombstones while erasing review text and history. */
export function erasePageReviews(ctx:FeatureContext,pageId:string):D1PreparedStatement[] {
 const requests='SELECT id FROM review_requests WHERE page_id=?';
 return [
  ctx.db.prepare(`UPDATE activity_entries SET target_kind='page',target_id=?,detail_json='{}',actor_member_id=NULL WHERE target_kind='review-request' AND target_id IN (${requests})`).bind(pageId,pageId),
  ctx.db.prepare(`UPDATE operation_receipts SET response_json=json_object('value',json_object('deleted',json('true'))) WHERE target_id IN (${requests})`).bind(pageId),
  ctx.db.prepare(`DELETE FROM review_request_deliveries WHERE request_id IN (${requests})`).bind(pageId),
  ctx.db.prepare(`DELETE FROM review_request_history WHERE request_id IN (${requests})`).bind(pageId),
  ctx.db.prepare('DELETE FROM review_requests WHERE page_id=?').bind(pageId),
  ctx.db.prepare('DELETE FROM verification_rule_flags WHERE page_id=?').bind(pageId),
 ];
}

/** Member rows become non-identifying tombstones; their authored notes do not survive. */
export function eraseMemberReviews(ctx:FeatureContext,memberId:string):D1PreparedStatement[] {
 const affected=`SELECT id FROM review_requests WHERE requester_member_id=? OR resolved_by_member_id=? OR (assignee_kind='member' AND assignee_id=?)`;
 return [
  ctx.db.prepare(`UPDATE operation_receipts SET response_json=json_object('value',json_object('erased',json('true'))) WHERE target_id IN (${affected})`).bind(memberId,memberId,memberId),
  ctx.db.prepare(`UPDATE activity_entries SET detail_json='{}' WHERE target_kind='review-request' AND target_id IN (${affected})`).bind(memberId,memberId,memberId),
  ctx.db.prepare(`UPDATE review_request_history SET snapshot_json='{}' WHERE actor_member_id=? OR request_id IN (${affected})`).bind(memberId,memberId,memberId,memberId),
  ctx.db.prepare("UPDATE review_requests SET note='',resolved_by_member_id=CASE WHEN resolved_by_member_id=? THEN NULL ELSE resolved_by_member_id END,updated_at=? WHERE requester_member_id=? OR resolved_by_member_id=?").bind(memberId,ctx.now,memberId,memberId),
 ];
}

export function removeMemberReviewAssignment(ctx:FeatureContext,memberId:string):D1PreparedStatement {
 return ctx.db.prepare("UPDATE review_requests SET state='cancelled',dispatch_paused_at=?,updated_at=? WHERE assignee_kind='member' AND assignee_id=? AND state='pending'").bind(ctx.now,ctx.now,memberId);
}
