import type { FeatureContext } from '../../app/feature-context';
/** A receiver may echo a title in its bounded response log. Clear it with source erasure. */
export function webhookPageErasure(ctx: FeatureContext, pageIds: string[]) {
  if (!pageIds.length) return [];
  return [ctx.db.prepare(`UPDATE webhook_attempts SET response='' WHERE delivery_id IN (
    SELECT d.id FROM webhook_deliveries d JOIN activity_entries a ON a.id=d.event_id WHERE
    a.target_id IN (SELECT value FROM json_each(?)) OR
    a.target_id IN (SELECT c.id FROM comments c JOIN comment_threads t ON t.id=c.thread_id WHERE t.page_id IN (SELECT value FROM json_each(?))) OR
    a.target_id IN (SELECT id FROM comment_threads WHERE page_id IN (SELECT value FROM json_each(?))) OR
    a.target_id IN (SELECT id FROM page_revisions WHERE page_id IN (SELECT value FROM json_each(?))) OR
    a.target_id IN (SELECT id FROM databases WHERE page_id IN (SELECT value FROM json_each(?))))`).bind(...Array(5).fill(JSON.stringify(pageIds)))];
}
