import {eraseHomeReferences} from '../homes/erasure';
import type {FeatureContext} from '../../app/feature-context';
/** Resolve identifiers before structured rows and comments are removed by the enclosing plan. */
export async function prepareErasePageDerivatives(ctx:FeatureContext,pageIds:string[]){
 const ids=JSON.stringify(pageIds),db=ctx.db;
 const entities=(await db.prepare(`SELECT id FROM databases WHERE page_id IN (SELECT value FROM json_each(?)) UNION SELECT id FROM database_fields WHERE database_id IN (SELECT id FROM databases WHERE page_id IN (SELECT value FROM json_each(?))) UNION SELECT id FROM database_views WHERE database_id IN (SELECT id FROM databases WHERE page_id IN (SELECT value FROM json_each(?))) UNION SELECT id FROM comment_threads WHERE page_id IN (SELECT value FROM json_each(?)) UNION SELECT c.id FROM comments c JOIN comment_threads t ON t.id=c.thread_id WHERE t.page_id IN (SELECT value FROM json_each(?))`).bind(ids,ids,ids,ids,ids).all<{id:string}>()).results.map(r=>r.id);
 const all=JSON.stringify([...pageIds,...entities]);
 return [...eraseHomeReferences(ctx,pageIds),
 db.prepare("DELETE FROM structured_revisions WHERE workspace_id=? AND entity_id IN (SELECT value FROM json_each(?))").bind(ctx.actor.workspaceId,all),
 db.prepare("UPDATE record_revisions SET content_json='{}',author_member_id=NULL WHERE entity_id IN (SELECT value FROM json_each(?))").bind(all),
 db.prepare("UPDATE core_entity_revisions SET content_json='{}',content_hash='',author_member_id=NULL WHERE workspace_id=? AND entity_id IN (SELECT value FROM json_each(?))").bind(ctx.actor.workspaceId,all),
 db.prepare("UPDATE activity_entries SET detail_json='{}',actor_member_id=NULL WHERE workspace_id=? AND target_id IN (SELECT value FROM json_each(?))").bind(ctx.actor.workspaceId,all),
 db.prepare("UPDATE operation_receipts SET response_json='{\"value\":{\"deleted\":true}}' WHERE workspace_id=? AND target_id IN (SELECT value FROM json_each(?)) AND json_extract(response_json,'$.value.deletedPageIds') IS NULL").bind(ctx.actor.workspaceId,all),
 db.prepare("DELETE FROM content_page_opens WHERE page_id IN (SELECT value FROM json_each(?))").bind(ids),
 db.prepare("DELETE FROM content_tree_expansion WHERE page_id IN (SELECT value FROM json_each(?))").bind(ids),
 db.prepare("UPDATE public_exposures SET host='erased.invalid',slug='erased-'||id,social_preview_json='{}',header_controls_json='[]',theme='default',duplicate_as_template=0,revoked_at=COALESCE(revoked_at,?) WHERE page_id IN (SELECT value FROM json_each(?))").bind(ctx.now,ids),
 ];
}
