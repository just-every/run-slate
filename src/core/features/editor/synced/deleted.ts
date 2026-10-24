import type {FeatureContext} from '../../../app/feature-context';
import type {BlockView} from '../../../shared/api/content';
/** Preserve the reference identity, never mutate its historical revision. */
export async function deletedReferenceStatements(ctx:FeatureContext,pageIds:string[],blockIds?:string[]){
 const refs=(await ctx.db.prepare("SELECT DISTINCT r.page_id AS pageId,json_extract(b.value,'$.id') AS blockId,json_extract(b.value,'$.content.sourcePageId') AS sourcePageId,json_extract(b.value,'$.content.sourceBlockId') AS sourceBlockId FROM page_revisions r JOIN pages p ON p.id=r.page_id,json_each(r.body_json) b WHERE p.workspace_id=? AND p.deleted_at IS NULL AND r.deleted_at IS NULL AND json_extract(b.value,'$.blockType')='synced-reference' AND json_extract(b.value,'$.content.staticId') IS NULL AND json_extract(b.value,'$.content.sourcePageId') IN (SELECT value FROM json_each(?))").bind(ctx.actor.workspaceId,JSON.stringify(pageIds)).all<{pageId:string;blockId:string;sourcePageId:string;sourceBlockId:string}>()).results;
 return refs.filter(r=>!blockIds||blockIds.includes(r.sourceBlockId)).map(r=>ctx.db.prepare('INSERT OR IGNORE INTO synced_deleted_references VALUES (?,?,?,?)').bind(r.pageId,r.blockId,r.sourcePageId,r.sourceBlockId));
}
export async function referenceDeleted(db:D1Database,block:BlockView){
 const c=block.content as {sourcePageId:string;sourceBlockId:string};
 return !!await db.prepare('SELECT 1 FROM synced_deleted_references WHERE copy_page_id=? AND copy_block_id=? AND source_page_id=? AND source_block_id=?').bind(block.pageId,block.id,c.sourcePageId,c.sourceBlockId).first();
}
