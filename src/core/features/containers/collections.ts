import type {FeatureContext} from '../../app/feature-context';
import {commitOperation,mutationGuard} from '../../app/operations';
import {requireContainerLevel,requireContainerAdministration} from '../sharing/current-access';
import {identityRevision} from '../workspace/revisions';
const latest="SELECT content_json FROM core_entity_revisions WHERE workspace_id=? AND entity_kind='container-collection' AND entity_id=? ORDER BY CAST(json_extract(content_json,'$.configurationSequence') AS INTEGER) DESC,id DESC LIMIT 1";
export async function readCollection(ctx:FeatureContext,id:string){
 await requireContainerLevel(ctx,id,'view');
 const row=await ctx.db.prepare(latest).bind(ctx.actor.workspaceId,id).first<{content_json:string}>();
 const container=await ctx.db.prepare('SELECT revision_id AS revisionId FROM containers WHERE id=?').bind(id).first<{revisionId:string}>();
 return {revisionId:container!.revisionId,isCollection:row?JSON.parse(row.content_json).isCollection===true:false};
}
export async function saveCollection(ctx:FeatureContext,id:string,input:{operationKey:string;expectedRevisionId:string;isCollection:boolean}){
 return commitOperation(ctx,{operationKey:input.operationKey,action:'container.collection',request:{id,...input},authorize:()=>requireContainerAdministration(ctx,id),prepare:async({revisionId})=>{
  const prior=await ctx.db.prepare(latest).bind(ctx.actor.workspaceId,id).first<{content_json:string}>(),sequence=prior?Number(JSON.parse(prior.content_json).configurationSequence??0)+1:1;
  return {entity:{kind:'container',id,revisionId},value:{revisionId,isCollection:input.isCollection},detail:{isCollection:input.isCollection},statements:[mutationGuard(ctx.db,'SELECT revision_id=? FROM containers WHERE id=?',[input.expectedRevisionId,id]),ctx.db.prepare('UPDATE containers SET revision_id=?,updated_at=? WHERE id=?').bind(revisionId,ctx.now,id),await identityRevision(ctx,revisionId,'container-collection',id,{isCollection:input.isCollection,configurationSequence:sequence})]};
 }});
}
