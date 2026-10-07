import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {mutationGuard} from '../../app/operations';
import {connection,adapterFor} from './service';
import {assertConnectionCurrent} from './authority';
import {NativeAdapter,recordStateSchema} from './native';
import {validatedOrigin} from './native-config';
import {getEffectAdapter} from './effects';

export function requireFreshObservation(observedAt:string,started:number){
 const now=Date.now(),observed=Date.parse(observedAt);
 if(!Number.isFinite(observed)||observed<now-60000||observed>now+5000||now-started>60000)throw new ApiProblem(409,'OWNING_STATE_STALE','The owning-state observation is not fresh enough. Try a new check.');
}
/** Read authority is independent of the effect API and its write capability. */
export async function owningStateReader(ctx:FeatureContext,connectionId:string,target:string,stateSchema:string|undefined){
 const row=await connection(ctx,connectionId),epoch=ctx.authorizationEpoch;
 const local=async()=>{await assertConnectionCurrent(ctx,row);if(ctx.authorizationEpoch!==epoch)throw new ApiProblem(403,'SOURCE_ACCESS_REVOKED','Source authority changed during verification.');};
 const secret=(ctx as FeatureContext&{sourceSecret?:string}).sourceSecret;
 const base=await adapterFor(ctx,row,secret);await local();
 if(base instanceof NativeAdapter){
  if(row.provider!=='orbit'||stateSchema!=='crm.handoff-state/1'||!/^opportunities\/[^/]+\/handoffs\/[^/]+$/.test(target))throw new ApiProblem(422,'OWNING_STATE_UNAVAILABLE','Prepare a new procedure for a negotiated Orbit handoff state.');
  validatedOrigin(base.config.origin,base.config.allowLoopback);
  if(base.config.accountId!==row.account_id||base.expected?.origin!==base.config.origin)throw new ApiProblem(403,'SOURCE_IDENTITY_CHANGED','The configured source identity changed.');
  const adapter=base.withAuthorityGuard(local);
  const read=async()=>{const value=await adapter.snapshot(target,true,true);await local();const identity=await adapter.identity();await local();if(!identity.scopes.includes('crm.evidence.read')||!identity.targets.some(t=>t===target||/^opportunities\/[^/]+$/.test(t)&&target.startsWith(t+'/handoffs/')))throw new ApiProblem(403,'SOURCE_ACCESS_REVOKED','This handoff is outside the current read grant.');
   if(!('canonicalUrl'in value)||typeof value.canonicalUrl!=='string'||new URL(value.canonicalUrl).origin!==base.config.origin)throw new ApiProblem(502,'INVALID_SOURCE_RESPONSE','Source canonical URL differs from its installation.');
   const state=recordStateSchema.safeParse('recordState'in value?value.recordState:undefined);if(!state.success)throw new ApiProblem(409,'OWNING_STATE_UNAVAILABLE','The source did not supply typed handoff state.');
   return {kind:'owning-source' as const,connectionId:row.id,provider:'orbit' as const,installationId:value.installationId,accountId:value.accountId,principalId:value.principalId,target,revision:value.revision,observedAt:value.observedAt,recordState:state.data,state:state.data.state};};
  return {row,epoch,local,read,authorize:async()=>{await base.identity();await local();},guards:()=>[mutationGuard(ctx.db,"SELECT revision_id=? AND state='connected' AND credential_ciphertext IS NOT NULL AND member_id=? AND workspace_id=? AND account_id=? FROM federation_connections WHERE id=?",[row.revision_id,ctx.actor.id,ctx.actor.workspaceId,row.account_id,row.id]),mutationGuard(ctx.db,'SELECT epoch=? FROM core_acl_epoch WHERE id=1',[epoch!])]};
 }
 if(row.provider!=='github'||stateSchema!==undefined)throw new ApiProblem(422,'OWNING_STATE_UNAVAILABLE','This source has no supported owning-state verification.');
 const adapter=await getEffectAdapter(ctx,connectionId,secret);await local();
 const read=async()=>{const value=await adapter.read(target);await local();return {kind:'owning-source' as const,connectionId:row.id,provider:'github' as const,accountId:row.account_id,target,revision:value.revision,observedAt:value.observedAt,state:value.content.state};};
 return {row,epoch,local,read,authorize:async()=>{await base.identity();await local();},guards:()=>[mutationGuard(ctx.db,"SELECT revision_id=? AND state='connected' AND credential_ciphertext IS NOT NULL FROM federation_connections WHERE id=?",[row.revision_id,row.id]),mutationGuard(ctx.db,'SELECT epoch=? FROM core_acl_epoch WHERE id=1',[epoch!])]};
}
