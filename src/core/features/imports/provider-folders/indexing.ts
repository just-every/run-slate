import type {FeatureContext} from '../../../app/feature-context';
import {mutationGuard} from '../../../app/operations';
import {createUlid} from '../../../shared/ulid';
import {verifySearchable} from '../../search/service';
/** Publication is durable; indexing resumes from its immutable page mappings. */
export async function finishFolderIndex(ctx:FeatureContext,id:string,revisionId:string){
 const pageIds=(await ctx.db.prepare("SELECT target_id FROM federation_import_mappings WHERE import_job_id=? AND source_kind='page'").bind(id).all<{target_id:string}>()).results.map(row=>row.target_id);
 if(!await verifySearchable(ctx,pageIds,{maxBatches:1,keyLimit:100}))return;
 await ctx.db.batch([
  mutationGuard(ctx.db,"SELECT status='active' FROM members WHERE id=? AND workspace_id=?",[ctx.actor.id,ctx.actor.workspaceId]),
  ctx.db.prepare("UPDATE provider_folder_runs SET state='completed',revision_id=?,updated_at=? WHERE id=? AND workspace_id=? AND actor_id=? AND state='indexing' AND revision_id=? AND NOT EXISTS(SELECT 1 FROM json_each(?) i WHERE NOT EXISTS(SELECT 1 FROM search_text s WHERE s.workspace_id=? AND s.page_id=i.value) OR EXISTS(SELECT 1 FROM search_dirty d WHERE d.workspace_id=? AND d.key IN ('page:'||i.value,'record:'||i.value)))").bind(createUlid(),ctx.now,id,ctx.actor.workspaceId,ctx.actor.id,revisionId,JSON.stringify(pageIds),ctx.actor.workspaceId,ctx.actor.workspaceId),
 ]);
}
