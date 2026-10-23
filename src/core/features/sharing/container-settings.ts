import {readClassification} from '../workspace/governance';
import {requireWorkspaceOwner} from './current-access';
import {requireImportPublication} from '../imports/publication';
import type {FeatureContext} from '../../app/feature-context';
import {commitOperation,mutationGuard} from '../../app/operations';
import {ApiProblem} from '../../app/problems';
import {requireContainerAdministration} from './current-access';
import {containerRevision} from '../containers/service';
export async function setContainerAccess(ctx:FeatureContext,input:{operationKey:string;id:string;expectedRevisionId:string;guestAccess:'allowed'|'forbidden';publicLinkAccess:'allowed'|'forbidden';anonymousAccess:'allowed'|'forbidden';visibility:'default'|'open'|'closed'|'private'}){
  return commitOperation(ctx,{operationKey:input.operationKey,action:'container.access-settings',request:input,authorize:async()=>{await requireImportPublication(ctx,input.id);await requireContainerAdministration(ctx,input.id);},prepare:async({revisionId})=>{
    const classification=await readClassification(ctx,input.id);
    if(classification.label==='Confidential'&&input.publicLinkAccess==='allowed')await requireWorkspaceOwner(ctx);

    const row=await ctx.db.prepare('SELECT visibility FROM containers WHERE id=? AND workspace_id=?').bind(input.id,ctx.actor.workspaceId).first<{visibility:string}>();if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');if(row.visibility==='personal')throw new ApiProblem(403,'PERSONAL_PRIVATE','A personal container cannot be opened.');
    return {entity:{id:input.id,kind:'container',revisionId},value:{id:input.id,revisionId},statements:[mutationGuard(ctx.db,'SELECT revision_id=? FROM containers WHERE id=?',[input.expectedRevisionId,input.id]),ctx.db.prepare('UPDATE containers SET guest_access=?,public_link_access=?,anonymous_access=?,visibility=?,revision_id=?,updated_at=? WHERE id=?').bind(input.guestAccess,input.publicLinkAccess,input.anonymousAccess,input.visibility,revisionId,ctx.now,input.id),await containerRevision(ctx,input.id,revisionId,input)]};
  }});
}
