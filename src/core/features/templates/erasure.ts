import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {commitOperation,mutationGuard} from '../../app/operations';
import {currentSubject,requireContainerLevel} from '../sharing/current-access';
import {prepareInvalidateExports} from '../portability/invalidation';
import {completeErasure} from '../archive/erasure-cleanup';
interface Row {id:string;container_id:string|null;is_shipped:number;deleted_at:string|null;revision_id:string;snapshot_json:string}
export async function permanentlyEraseTemplate(ctx:FeatureContext,id:string,input:{operationKey:string;expectedRevisionId:string;confirmed:true}){
 if(input.confirmed!==true)throw new ApiProblem(400,'CONFIRM_ERASURE','Confirm permanent template erasure.');
 const read=()=>ctx.db.prepare('SELECT * FROM knowledge_templates WHERE id=? AND workspace_id=?').bind(id,ctx.actor.workspaceId).first<Row>();
 const result=await commitOperation(ctx,{operationKey:input.operationKey,action:'templates.permanent-delete',request:{id,...input},authorize:async()=>{
  const subject=await currentSubject(ctx);const row=await read();if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');
  if(row.is_shipped)throw new ApiProblem(403,'SHIPPED_TEMPLATE','Shipped templates cannot be erased.');
  if(!row.container_id&&subject.isGuest)throw new ApiProblem(403,'FORBIDDEN','Only workspace members can erase workspace templates.');
  if(row.container_id)await requireContainerLevel(ctx,row.container_id,'full');
 },prepare:async({revisionId})=>{
  const row=(await read())!;
  if(row.snapshot_json==='{}')return {entity:{id,kind:'template',revisionId:row.revision_id},value:{id,erased:true},noChange:true,statements:[mutationGuard(ctx.db,'SELECT revision_id=? FROM knowledge_templates WHERE id=?',[input.expectedRevisionId,id])]};
  if(!row.deleted_at)throw new ApiProblem(409,'NOT_DELETED','Move the template to Deleted before permanently erasing it.');
  const assets=(await ctx.db.prepare("SELECT DISTINCT value AS key FROM knowledge_templates t,json_tree(t.snapshot_json) j WHERE t.id=? AND j.key='storageKey' UNION SELECT DISTINCT value AS key FROM structured_revisions r,json_tree(r.snapshot_json) j WHERE r.entity_kind='template' AND r.entity_id=? AND j.key='storageKey'").bind(id,id).all<{key:string}>()).results;
  const statements=[ctx.db.prepare("INSERT INTO core_job_failures(id,kind,attempts,state,error_code,updated_at) VALUES(?,'erasure-template',1,'pending','ERASURE_STORAGE_PENDING',?) ON CONFLICT(id) DO UPDATE SET state='pending',updated_at=excluded.updated_at").bind('erasure:template:'+id,ctx.now),mutationGuard(ctx.db,'SELECT revision_id=? AND deleted_at IS NOT NULL AND is_shipped=0 FROM knowledge_templates WHERE id=?',[input.expectedRevisionId,id]),...prepareInvalidateExports(ctx),ctx.db.prepare("UPDATE knowledge_templates SET title='',description='',category='',snapshot_json='{}',revision_id=?,updated_at=? WHERE id=?").bind(revisionId,ctx.now,id),ctx.db.prepare("DELETE FROM structured_revisions WHERE entity_kind='template' AND entity_id=?").bind(id),ctx.db.prepare("UPDATE activity_entries SET actor_member_id=NULL,detail_json='{}' WHERE target_kind='template' AND target_id=?").bind(id),ctx.db.prepare("UPDATE operation_receipts SET response_json='{\"value\":{\"erased\":true}}' WHERE target_kind='template' AND target_id=? AND operation_key!=?").bind(id,input.operationKey)];
  for(const asset of assets)statements.push(ctx.db.prepare("INSERT INTO content_media_cleanup SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM knowledge_templates t,json_tree(t.snapshot_json) j WHERE t.id!=? AND j.key='storageKey' AND j.value=?) AND NOT EXISTS(SELECT 1 FROM structured_revisions r,json_tree(r.snapshot_json) j WHERE r.entity_id!=? AND j.key='storageKey' AND j.value=?) ON CONFLICT DO NOTHING").bind(asset.key,ctx.now,id,asset.key,id,asset.key));
  return {entity:{id,kind:'template',revisionId},value:{id,erased:true},statements};
 }});await completeErasure(ctx);await ctx.db.prepare("UPDATE core_job_failures SET state='recovered',updated_at=? WHERE id=?").bind(ctx.now,'erasure:template:'+id).run();return result;
}
