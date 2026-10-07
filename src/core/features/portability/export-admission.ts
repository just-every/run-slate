import type {FeatureContext} from '../../app/feature-context';
import {createUlid} from '../../shared/ulid';
import {identityRevision} from '../workspace/revisions';
/** Admission, its identity revision and activity are one operation-key guarded transaction. */
export async function exportAdmission(ctx:FeatureContext,id:string,operationKey:string,now:string){
 const revisionId=createUlid();
 return [
  await identityRevision({...ctx,now},revisionId,'export',id,{state:'queued'}),
  ctx.db.prepare("INSERT INTO federation_exports(id,workspace_id,actor_id,state,revision_id,created_at,updated_at) VALUES(?,?,?,'queued',?,?,?)").bind(id,ctx.actor.workspaceId,ctx.actor.id,revisionId,now,now),
  ctx.db.prepare('INSERT INTO activity_entries(id,workspace_id,actor_member_id,feature,action,target_kind,target_id,detail_json,operation_key,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(createUlid(),ctx.actor.workspaceId,ctx.actor.id,'exports','exports.workspace','export',id,'{}',operationKey,now)
 ];
}
