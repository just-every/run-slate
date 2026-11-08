import type {FeatureContext} from '../../app/feature-context';
import {commitOperation,mutationGuard} from '../../app/operations';
import {ApiProblem} from '../../app/problems';
import {requireWorkspaceOwner,requireContainerLevel} from '../sharing/current-access';
import {containerRevision} from './service';

/** Explicit deletion retires an empty space without erasing its retained audit identity. */
export async function deleteContainer(ctx:FeatureContext,id:string,input:{operationKey:string;expectedRevisionId:string;confirmed:boolean}){
 return commitOperation(ctx,{
  operationKey:input.operationKey,action:'containers.delete',request:{id,...input},
  authorize:async()=>{await requireWorkspaceOwner(ctx);await requireContainerLevel(ctx,id,'full');},
  prepare:async({revisionId})=>{
   const container=await ctx.db.prepare('SELECT visibility,revision_id,trashed_at FROM containers WHERE id=? AND workspace_id=?').bind(id,ctx.actor.workspaceId).first<{visibility:string;revision_id:string;trashed_at:string|null}>();
   if(!container)throw new ApiProblem(404,'NOT_FOUND','Not found.');
   if(container.visibility==='personal')throw new ApiProblem(403,'PERSONAL_CONTAINER_PROTECTED','Personal spaces follow their member lifecycle.');
   if(!input.confirmed)throw new ApiProblem(400,'CONFIRMATION_REQUIRED','Confirm deletion of this empty space.');
   const empty="NOT EXISTS(SELECT 1 FROM pages WHERE container_id=? AND deleted_at IS NULL)";
   if(!await ctx.db.prepare('SELECT '+empty+' AS empty').bind(id).first<number>('empty'))throw new ApiProblem(409,'CONTAINER_NOT_EMPTY','Move or permanently delete every page before deleting this space.');
   const guards=[mutationGuard(ctx.db,'SELECT revision_id=? FROM containers WHERE id=? AND workspace_id=?',[input.expectedRevisionId,id,ctx.actor.workspaceId]),mutationGuard(ctx.db,'SELECT '+empty,[id])];
   if(container.trashed_at)return {noChange:true,statements:guards,entity:{id,kind:'container',revisionId:container.revision_id},value:{id,deleted:true}};
   return {entity:{id,kind:'container',revisionId},value:{id,deleted:true},statements:[...guards,ctx.db.prepare('UPDATE containers SET trashed_at=?,revision_id=?,updated_at=? WHERE id=?').bind(ctx.now,revisionId,ctx.now,id),await containerRevision(ctx,id,revisionId,{deleted:true})]};
  },
 });
}
