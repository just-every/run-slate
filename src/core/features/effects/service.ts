import {trialEffectAdmission} from '../experiments/effect-admission';
import {requirePublicEvidence} from '../ai/disclosure';
import { z } from 'zod';
import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { commitOperation,mutationGuard,requestHash } from '../../app/operations';
import {resolveEvidence} from '../ai/evidence';
import { getEffectAdapter,resolveEffectAudience } from '../connectors/effects';
import { requireRun } from '../runs/repository';
import { requireEffectRun } from './authority';
import { requireGrant } from './grants';
import { id,revision,json } from '../ai/persistence';
import { terminal } from '../ai/contracts';
export {effectSchema} from './contracts';
import {effectSchema,type EffectInput} from './contracts';
export type {EffectInput} from './contracts';
export interface EffectRow {id:string;workspace_id:string;run_id:string;operation_key:string;request_hash:string;grant_id:string;operation:string;account_id:string;intent_json:string;state:string;receipt_json:string|null;observed_json:string|null;failure_reason:string|null;revision_id:string;intent_at:string;dispatched_at:string|null;confirmed_at:string|null}
async function authorizeIntent(ctx:FeatureContext,input:EffectInput,reconciliation=false){
 const run=await requireEffectRun(ctx,input.runId);
 if(!reconciliation&&(terminal(run.status)||run.status==='paused'))throw new ApiProblem(409,'RUN_STOPPED','This run cannot dispatch effects.');
 if(JSON.parse(run.input_json).evaluationCaseSetId)throw new ApiProblem(403,'EVALUATION_IS_NOT_AUTHORITY','Evaluation never authorizes external effects.');
 const trialGuard=reconciliation?undefined:await trialEffectAdmission(ctx,run,input);
 const secret=(ctx as FeatureContext&{sourceSecret?:string}).sourceSecret,adapter=await getEffectAdapter(ctx,input.connectionId,secret);
 let audience=JSON.parse(run.audience_json) as string[];
 if(input.operation==='github.issue.update'){await requirePublicEvidence(ctx,JSON.parse(run.refs_json));audience=[...audience,'public'];}
 else{const destination=await resolveEffectAudience(ctx,input.connectionId,input.target,input.operation,secret,input.operation==='happytohelp.article.update'?input.content.status:undefined);if(destination.audienceRevision!==input.expectedAudienceRevision)throw new ApiProblem(409,'AUDIENCE_CHANGED','The destination audience changed.');const publishing=input.operation==='happytohelp.article.update'&&input.content.status==='published';if(destination.publicAudience||destination.unmappedCount>0||publishing){await requirePublicEvidence(ctx,JSON.parse(run.refs_json));audience=[...audience,'public'];}else{await resolveEvidence(ctx,JSON.parse(run.refs_json),destination.memberIds,{current:true});audience=[...new Set([...audience,...destination.memberIds])];}}
 const grant=await requireGrant(ctx,input.grantId,{kind:'effect',operation:input.operation,target:input.target,account:input.accountId,sourceIds:JSON.parse(run.refs_json).map((r:{sourceId:string})=>r.sourceId),audience,costMicros:input.costMicros,contentHash:await requestHash(input.content),conditions:{expectedRevision:input.expectedRevision,...('expectedAudienceRevision'in input?{expectedAudienceRevision:input.expectedAudienceRevision}:{})}});
 if(!adapter.capabilities.operations.includes(input.operation))throw new ApiProblem(422,'UNSUPPORTED_EFFECT','The current connector does not delegate this operation.');
 if(adapter.accountId!==input.accountId)throw new ApiProblem(403,'ACCOUNT_MISMATCH','The connector account differs from the granted account.');
 if(!adapter.capabilities.conditionalWrite&&!grant.scope.acceptNonAtomicProvider)throw new ApiProblem(409,'NON_ATOMIC_PROVIDER','This provider cannot atomically reject concurrent edits. Exact owner authority must explicitly accept that limitation.');
 return {run,grant,adapter,trialGuard};
}
export async function prepareEffect(ctx:FeatureContext,raw:EffectInput){const input=effectSchema.parse(raw);let trialGuard:D1PreparedStatement|undefined;return commitOperation(ctx,{operationKey:input.operationKey,action:'effects.prepare',request:input,authorize:async()=>{trialGuard=(await authorizeIntent(ctx,input)).trialGuard;},prepare:async({revisionId})=>{const prior=await ctx.db.prepare("WITH RECURSIVE lineage(id) AS (SELECT parent_id FROM intelligence_runs WHERE id=? UNION ALL SELECT r.parent_id FROM intelligence_runs r JOIN lineage l ON r.id=l.id WHERE r.parent_id IS NOT NULL) SELECT id,intent_json,state FROM intelligence_effects WHERE run_id IN (SELECT id FROM lineage) AND state IN ('confirmed','uncertain','dispatched')").bind(input.runId).all<{id:string;intent_json:string;state:string}>();for(const effect of prior.results){const old=JSON.parse(effect.intent_json) as EffectInput;if(old.operation===input.operation&&old.accountId===input.accountId&&old.target===input.target&&await requestHash(old.content)===await requestHash(input.content))throw new ApiProblem(409,'INHERITED_EFFECT_RECEIPT','The predecessor already owns this effect receipt; inspect or reconcile it instead of sending again.');}const effectId=id(),hash=await requestHash(input);return {entity:{id:effectId,kind:'effect',revisionId},value:{id:effectId,state:'prepared',revisionId},statements:[...(trialGuard?[trialGuard]:[]),mutationGuard(ctx.db,"SELECT revoked_at IS NULL AND expires_at>? FROM intelligence_grants WHERE id=?",[ctx.now,input.grantId]),ctx.db.prepare("INSERT INTO intelligence_effects(id,workspace_id,run_id,operation_key,request_hash,grant_id,operation,account_id,intent_json,state,revision_id,intent_at) VALUES(?,?,?,?,?,?,?,?,?,'prepared',?,?)").bind(effectId,ctx.actor.workspaceId,input.runId,input.operationKey,hash,input.grantId,input.operation,input.accountId,json(input),revisionId,ctx.now),revision(ctx,revisionId,'effect',effectId,input)]};}});}
export async function requireEffect(ctx:FeatureContext,effectId:string){const effect=await ctx.db.prepare('SELECT * FROM intelligence_effects WHERE id=? AND workspace_id=?').bind(effectId,ctx.actor.workspaceId).first<EffectRow>();if(!effect)throw new ApiProblem(404,'NOT_FOUND','Not found.');await requireRun(ctx,effect.run_id);return effect;}
export async function dispatchEffect(ctx:FeatureContext,effectId:string){
 const effect=await requireEffect(ctx,effectId);const input=effectSchema.parse(JSON.parse(effect.intent_json));const {adapter,grant,trialGuard}=await authorizeIntent(ctx,input);
 if(effect.state!=='prepared')return effect;
 // Durable claim precedes the only dispatch. A crash from this point is reconciled, never retried.
 await ctx.db.batch([...(trialGuard?[trialGuard]:[]),mutationGuard(ctx.db,"SELECT state='prepared' FROM intelligence_effects WHERE id=?",[effectId]),mutationGuard(ctx.db,"SELECT revision_id=? AND revoked_at IS NULL AND expires_at>? FROM intelligence_grants WHERE id=?",[grant.row.revision_id,ctx.now,input.grantId]),mutationGuard(ctx.db,'SELECT epoch=? FROM core_acl_epoch WHERE id=1',[ctx.authorizationEpoch!]),mutationGuard(ctx.db,"SELECT status NOT IN ('paused','cancelled','failed','completed') FROM intelligence_runs WHERE id=?",[input.runId]),ctx.db.prepare("UPDATE intelligence_effects SET state='dispatched',dispatched_at=?,revision_id=? WHERE id=?").bind(ctx.now,id(),effectId)]);
 try{
  const result=await adapter.dispatch(input);
  // Retain actual provider receipts even if authority is revoked during the request; never undo a completed write.
  await ctx.db.prepare("UPDATE intelligence_effects SET state=?,receipt_json=?,observed_json=?,confirmed_at=?,revision_id=? WHERE id=? AND state IN ('dispatched','uncertain')").bind(result.confirmed?'confirmed':'uncertain',json(result.receipt),json(result.observed),result.confirmed?new Date().toISOString():null,id(),effectId).run();
 }catch(error){const refused=error instanceof ApiProblem&&[400,401,403,404,409,422].includes(error.status);await ctx.db.prepare("UPDATE intelligence_effects SET state=?,failure_reason=?,revision_id=? WHERE id=? AND state='dispatched'").bind(refused?'failed':'uncertain',error instanceof ApiProblem?error.code:'DISPATCH_UNCERTAIN',id(),effectId).run();}
 return requireEffect(ctx,effectId);
}
export async function reconcileEffect(ctx:FeatureContext,effectId:string){
 const effect=await requireEffect(ctx,effectId);if(!['uncertain','dispatched'].includes(effect.state))return effect;
 const input=effectSchema.parse(JSON.parse(effect.intent_json));const {adapter}=await authorizeIntent(ctx,input,true);const result=await adapter.reconcile(input);
 // GitHub read-back alone proves content, not which request wrote it. Lost receipts stay uncertain.
 const recovered=result.attributable&&result.receipt?result.receipt:null;const confirmed=!!recovered||!!effect.receipt_json&&result.matches;
 await ctx.db.prepare("UPDATE intelligence_effects SET state=?,receipt_json=COALESCE(?,receipt_json),observed_json=?,confirmed_at=?,failure_reason=?,revision_id=? WHERE id=? AND state IN ('uncertain','dispatched')").bind(confirmed?'confirmed':'uncertain',recovered?json(recovered):null,json(result.observed),confirmed?new Date().toISOString():null,confirmed?null:'Matching state without an attributable provider receipt is still uncertain.',id(),effectId).run();return requireEffect(ctx,effectId);
}
