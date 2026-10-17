import type { FeatureContext } from '../../app/feature-context';
/** Content erasure composes this batch: delivery receipts survive, never retained source payload. */
export function discoveryPurgePageStatements(ctx:FeatureContext,pageId:string):D1PreparedStatement[]{return [
 ctx.db.prepare('DELETE FROM reminders WHERE page_id=?').bind(pageId),
 ctx.db.prepare('DELETE FROM task_origins WHERE page_id=?').bind(pageId),
 ctx.db.prepare("UPDATE chat_deliveries SET state='cancelled',failure='source_erased' WHERE outbox_id IN (SELECT id FROM notification_outbox WHERE page_id=?) AND state='pending'").bind(pageId),
 ctx.db.prepare("UPDATE notification_outbox SET detail_json='{}',page_id=NULL,comment_id=NULL,recipients_json='[]',watched_recipients_json='[]',processed_at=COALESCE(processed_at,?) WHERE page_id=?").bind(ctx.now,pageId),
 ctx.db.prepare('DELETE FROM notifications WHERE source_page_id=?').bind(pageId),
 ctx.db.prepare('DELETE FROM page_views WHERE page_id=?').bind(pageId),ctx.db.prepare('DELETE FROM watch_edit_sessions WHERE page_id=?').bind(pageId),ctx.db.prepare('DELETE FROM page_watches WHERE page_id=?').bind(pageId),ctx.db.prepare('DELETE FROM page_favourites WHERE page_id=?').bind(pageId),ctx.db.prepare('DELETE FROM recent_pages WHERE page_id=?').bind(pageId),ctx.db.prepare('DELETE FROM search_documents WHERE page_id=?').bind(pageId),
 ];}
