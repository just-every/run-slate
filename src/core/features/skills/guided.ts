import {z} from 'zod';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {commitOperation,mutationGuard} from '../../app/operations';
import {requireRun,requireFreshRunAuthority} from '../runs/repository';
import {resolveEvidence} from '../ai/evidence';
import {evidenceSchema} from '../ai/contracts';
import {owningStateReader,requireFreshObservation} from '../connectors/owning-state';
import {id,revision,json} from '../ai/persistence';
import {guidedSchema,verificationSchema,persisted,requireGroundedSteps} from './guided-definition';
export {guidedSchema} from './guided-definition';
export async function createGuidedTask(ctx:FeatureContext,raw:z.infer<typeof guidedSchema>){
 const input=guidedSchema.parse(raw),run=await requireRun(ctx,input.runId,true);requireFreshRunAuthority(run);
 await requireGroundedSteps(ctx,run,input.steps);
 return commitOperation(ctx,{operationKey:input.operationKey,action:'skills.guide',request:input,authorize:async()=>{
  const current=await requireRun(ctx,input.runId,true);requireFreshRunAuthority(current);await requireGroundedSteps(ctx,current,input.steps);
  for(const s of input.steps)await resolveEvidence(ctx,s.refs,JSON.parse(run.audience_json),{current:true});
 },prepare:async({revisionId})=>{const taskId=id();return {entity:{id:taskId,kind:'guided-task',revisionId},value:{id:taskId,revisionId,state:'active'},statements:[mutationGuard(ctx.db,'SELECT revision_id=? FROM intelligence_runs WHERE id=?',[run.revision_id,run.id]),ctx.db.prepare("INSERT INTO intelligence_guided_tasks(id,workspace_id,run_id,page_id,owner_id,state,revision_id,created_at) VALUES(?,?,?,?,?,'active',?,?)").bind(taskId,ctx.actor.workspaceId,run.id,run.page_id,ctx.actor.id,revisionId,ctx.now),...input.steps.map((s,i)=>ctx.db.prepare('INSERT INTO intelligence_guided_steps(id,task_id,ordinal,instruction,source_refs_json,verification_json) VALUES(?,?,?,?,?,?)').bind(id(),taskId,i,s.instruction,json(s.refs),json(s.verification))),revision(ctx,revisionId,'guided-task',taskId,input)]};}});
}
export async function guidedTask(ctx:FeatureContext,taskId:string){
 const task=await ctx.db.prepare('SELECT * FROM intelligence_guided_tasks WHERE id=? AND workspace_id=?').bind(taskId,ctx.actor.workspaceId).first<{id:string;run_id:string;revision_id:string;state:string;owner_id:string}>();
 if(!task)throw new ApiProblem(404,'NOT_FOUND','Not found.');const run=await requireRun(ctx,task.run_id);
 const steps=await ctx.db.prepare('SELECT * FROM intelligence_guided_steps WHERE task_id=? ORDER BY ordinal').bind(taskId).all<{id:string;instruction:string;source_refs_json:string;verification_json:string;receipt_json:string|null;state:string}>();
 for(const s of steps.results){persisted(verificationSchema,s.verification_json);await resolveEvidence(ctx,persisted(z.array(evidenceSchema),s.source_refs_json),JSON.parse(run.audience_json));}
 return {...task,steps:steps.results};
}
export async function verifyGuidedStep(ctx:FeatureContext,input:{operationKey:string;taskId:string;stepId:string;humanConfirmation?:string}){
 const started=Date.now(),task=await guidedTask(ctx,input.taskId),run=await requireRun(ctx,task.run_id);requireFreshRunAuthority(run);
 const step=task.steps.find(s=>s.id===input.stepId);if(!step)throw new ApiProblem(404,'NOT_FOUND','Not found.');
 const check=persisted(verificationSchema,step.verification_json);
 const reader=check.kind==='owning-source'?await owningStateReader(ctx,check.connectionId,check.remoteId,'stateSchema'in check?check.stateSchema:undefined):undefined;
 if(step.state==='completed'){
  await reader?.authorize();if(check.kind==='human-action'&&ctx.actor.id!==check.memberId)throw new ApiProblem(403,'HUMAN_ACTION_PENDING','Only the named colleague can confirm this step.');
  return {value:{id:task.id,stepId:step.id,state:'completed',receipt:step.receipt_json?JSON.parse(step.receipt_json):null},receipt:null};
 }
 if(task.state!=='active'||step.state!=='pending')throw new ApiProblem(409,'GUIDED_TASK_INACTIVE','This guided task is inactive; prepare a newly authorized procedure.');
 // Resolve the exact issued source again; the live observation does not replace pinned instruction citations.
 await requireGroundedSteps(ctx,run,task.steps.map(s=>({instruction:s.instruction,refs:persisted(z.array(evidenceSchema),s.source_refs_json),verification:persisted(verificationSchema,s.verification_json)})));
 let receipt:unknown,observation:Awaited<ReturnType<NonNullable<typeof reader>['read']>>|undefined;
 if(check.kind==='human-action'){
  if(ctx.actor.id!==check.memberId||!input.humanConfirmation?.trim())throw new ApiProblem(403,'HUMAN_ACTION_PENDING','The named colleague must confirm their own action.');
  receipt={kind:'human-action',memberId:ctx.actor.id,note:input.humanConfirmation,at:new Date().toISOString()};
 }else{
  observation=await reader!.read();requireFreshObservation(observation.observedAt,started);
  if(observation.state!==check.expectedState)throw new ApiProblem(409,'OWNING_STATE_UNCONFIRMED','The owning system does not confirm the expected step.');
  const {state:_,...record}=observation;receipt={...record,confirmedAt:new Date().toISOString()};
 }
 try{return await commitOperation(ctx,{operationKey:input.operationKey,action:'skills.verify-step',request:input,authorize:async()=>{
  await reader?.local();const current=await guidedTask(ctx,input.taskId);const freshRun=await requireRun(ctx,current.run_id);requireFreshRunAuthority(freshRun);if(freshRun.revision_id!==run.revision_id||!['needs-review','completed'].includes(freshRun.status))throw new ApiProblem(409,'GUIDED_TASK_INACTIVE','The procedure changed during verification.');
  if(current.state!=='active'||current.revision_id!==task.revision_id)throw new ApiProblem(409,'GUIDED_TASK_INACTIVE','The guided task changed during verification.');
  if(reader&&observation){const final=await reader.read();requireFreshObservation(final.observedAt,started);requireFreshObservation(observation.observedAt,started);
   if(final.revision!==observation.revision||final.state!==observation.state||final.accountId!==observation.accountId||final.target!==observation.target||('installationId'in final&&('installationId'in observation&&final.installationId!==observation.installationId||'principalId'in observation&&final.principalId!==observation.principalId)))throw new ApiProblem(409,'OWNING_STATE_CHANGED','The owning source changed during verification. Start a new check.');
   await reader.local();
  }
 },prepare:async({revisionId})=>({entity:{id:input.taskId,kind:'guided-task',revisionId},value:{id:input.taskId,stepId:input.stepId,state:'completed',receipt},statements:[
  ...(reader?reader.guards():[]),
  ...(observation?[mutationGuard(ctx.db,"SELECT (julianday('now')-julianday(?))*86400000 BETWEEN -5000 AND 60000",[observation.observedAt])]:[]),
  mutationGuard(ctx.db,"SELECT (julianday('now')-julianday(?))*86400000<=60000",[new Date(started).toISOString()]),
  mutationGuard(ctx.db,"SELECT revision_id=? AND status IN ('needs-review','completed') FROM intelligence_runs WHERE id=?",[run.revision_id,run.id]),
  mutationGuard(ctx.db,"SELECT state='active' AND revision_id=? FROM intelligence_guided_tasks WHERE id=? AND workspace_id=?",[task.revision_id,task.id,ctx.actor.workspaceId]),
  mutationGuard(ctx.db,"SELECT state='pending' AND verification_json=? AND source_refs_json=? FROM intelligence_guided_steps WHERE id=? AND task_id=?",[step.verification_json,step.source_refs_json,step.id,task.id]),
  ctx.db.prepare("UPDATE intelligence_guided_steps SET state='completed',receipt_json=?,completed_at=? WHERE id=?").bind(json(receipt),new Date().toISOString(),input.stepId),
  ctx.db.prepare("UPDATE intelligence_guided_tasks SET state=CASE WHEN EXISTS(SELECT 1 FROM intelligence_guided_steps WHERE task_id=? AND state='pending') THEN 'active' ELSE 'completed' END,revision_id=? WHERE id=?").bind(input.taskId,revisionId,input.taskId),revision(ctx,revisionId,'guided-step',input.taskId,{stepId:input.stepId,receipt})]})});}catch(error){
  if(error instanceof ApiProblem&&['REVISION_CONFLICT','GUIDED_TASK_INACTIVE'].includes(error.code)){const current=await guidedTask(ctx,input.taskId);if(current.steps.find(s=>s.id===step.id)?.state==='completed')return verifyGuidedStep(ctx,input);}
  throw error;
 }
}
