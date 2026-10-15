import {interruptAttempt} from './attempts';
import {equivalenceKey,reusableRun,bindEquivalence} from './coalescing';
import {reserveAttention,releaseAttention,requireAttentionCapacity} from './attention';
import {requireWritingSelection} from '../ai/selection';
import {gatherEvidence} from '../ai/gather';
import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { commitOperation, mutationGuard } from '../../app/operations';
import { requirePageLevel } from '../sharing/current-access';
import { requestSchema, terminal, type AskInput } from '../ai/contracts';
import { resolveEvidence } from '../ai/evidence';
import { chooseRoute } from '../ai/model-policy';
import { maximumCost } from '../ai/provider';
import { reserveBudget,settleBudget } from '../ai/budget';
import { id,revision,json } from '../ai/persistence';
import { requireRun,reauthorizeRun,requireFreshRunAuthority } from './repository';
import { requireActiveSkill,requirePinnedSkillContinuation,requireEvaluationSkill } from '../skills/admission';
export async function startRun(ctx:FeatureContext,raw:AskInput,config:{demo?:boolean;apiKey?:string;localUrl?:string;localToken?:string},parentRunId?:string,evaluationCaseSetId?:string,parentInquiryId?:string,ambientEventId?:string){
 const priorReceipt=await ctx.db.prepare('SELECT r.* FROM operation_receipts o JOIN intelligence_runs r ON r.id=o.target_id WHERE o.workspace_id=? AND o.actor_member_id=? AND o.operation_key=?').bind(ctx.actor.workspaceId,ctx.actor.id,raw.operationKey).first<import('../ai/contracts').RunRow>();if(priorReceipt)requireFreshRunAuthority(priorReceipt);
 if(evaluationCaseSetId){const restored=await ctx.db.prepare("SELECT json_extract(execution_json,'$.recoveryPausedAt') AS marker FROM intelligence_evaluation_cases WHERE id=? AND workspace_id=?").bind(evaluationCaseSetId,ctx.actor.workspaceId).first<{marker:string|null}>();if(restored?.marker)throw new ApiProblem(409,'RESTORED_AUTHORITY_REQUIRED','Prepare a fresh evaluation after restoring this workflow.');}
 const input=requestSchema.parse(raw);const audience=[...new Set(input.audience??[ctx.actor.id])].sort();input.audience=audience;
 if(input.selection){if(input.selection.pageId!==input.pageId||!input.refs.some(r=>r.kind==='page'&&r.sourceId===input.pageId&&r.revisionId===input.selection!.revisionId))throw new ApiProblem(400,'SELECTION_SCOPE','Pin the selected page revision in the request evidence.');await requireWritingSelection(ctx,input.selection);}
 if(!config.demo&&!config.apiKey&&!(config.localUrl&&config.localToken))throw new ApiProblem(503,'PROVIDER_UNAVAILABLE','AI_API_KEY is not configured.');
 const gathered=evaluationCaseSetId||input.skillRevisionId?{refs:input.refs,coverage:[]}:await gatherEvidence(ctx,input.pageId,input.question,input.refs,audience);input.refs=gathered.refs;
 const packet=await resolveEvidence(ctx,input.refs,audience,{current:true});
 const chosen=await chooseRoute(ctx,input.kind,input.frontier);let skillInstructions='';if(input.skillRevisionId){const definition=evaluationCaseSetId?await requireEvaluationSkill(ctx,input.skillRevisionId,evaluationCaseSetId,input.question,input.refs):await requireActiveSkill(ctx,input.skillRevisionId,input.refs,audience,0);skillInstructions=definition.instructions;}
 const reserve=maximumCost(chosen.route,input.question+skillInstructions,packet,input.maxOutputTokens);
 if(input.skillRevisionId&&!evaluationCaseSetId)await requireActiveSkill(ctx,input.skillRevisionId,input.refs,audience,reserve);
 const key=await equivalenceKey(ctx,input,{parentRunId:parentRunId??null,evaluationCaseSetId:evaluationCaseSetId??null,parentInquiryId:parentInquiryId??null,ambientEventId:ambientEventId??null});
 const commit=()=>commitOperation(ctx,{operationKey:input.operationKey,action:'runs.start',request:{...input,parentRunId:parentRunId??null,evaluationCaseSetId:evaluationCaseSetId??null,parentInquiryId:parentInquiryId??null,ambientEventId:ambientEventId??null},authorize:async()=>{if(!await ctx.db.prepare('SELECT ai_enabled FROM workspaces WHERE id=?').bind(ctx.actor.workspaceId).first<number>('ai_enabled'))throw new ApiProblem(403,'AI_DISABLED','AI has been disabled by the owner.');await requirePageLevel(ctx,input.pageId,'view');await resolveEvidence(ctx,input.refs,audience,{current:true});},prepare:async({revisionId})=>{
  const shared=await reusableRun(ctx,key);if(shared)return {entity:{id:shared.id,kind:'run',revisionId:shared.revision_id},value:{id:shared.id,status:shared.status,revisionId:shared.revision_id},noChange:true,statements:[mutationGuard(ctx.db,"SELECT status IN ('queued','running','needs-review') AND revision_id=? FROM intelligence_runs WHERE id=?",[shared.revision_id,shared.id])]};
  await requireAttentionCapacity(ctx);const runId=id();const stored={...input,route:chosen.route,evaluationCaseSetId,parentInquiryId,ambientEventId,coverage:gathered.coverage};
  return {entity:{id:runId,kind:'run',revisionId},value:{id:runId,status:'queued',revisionId},statements:[...(ambientEventId?[mutationGuard(ctx.db,"SELECT s.state='active' AND e.workspace_id=? FROM intelligence_ambient_events e JOIN intelligence_ambient_scopes s ON s.id=e.scope_id WHERE e.id=?",[ctx.actor.workspaceId,ambientEventId])]:[]),...bindEquivalence(ctx,key,runId),...reserveAttention(ctx,runId,runId),...(parentInquiryId?[mutationGuard(ctx.db,"SELECT COALESCE(json_extract(interim_json,'$.stopped'),0)=0 FROM intelligence_inquiries WHERE id=? AND workspace_id=?",[parentInquiryId,ctx.actor.workspaceId])]:[]),ctx.db.prepare("INSERT INTO intelligence_runs(id,workspace_id,requester_id,page_id,kind,status,revision_id,input_json,refs_json,audience_json,skill_revision_id,provider,model,route_reason,reserved_micros,created_at,updated_at,agent_credential_id,parent_id) VALUES(?,?,?,?,?,'queued',?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(runId,ctx.actor.workspaceId,ctx.actor.id,input.pageId,input.kind,revisionId,json(stored),json(input.refs),json(audience),input.skillRevisionId??null,chosen.route.provider,chosen.route.model,chosen.reason,reserve,ctx.now,ctx.now,(ctx as FeatureContext&{agentCredentialId?:string}).agentCredentialId??null,parentRunId??null),...reserveBudget(ctx,runId,reserve,chosen.route,input.skillRevisionId),revision(ctx,revisionId,'run',runId,stored)]};
 }});
 let result;try{result=await commit();}catch(error){if(!(error instanceof ApiProblem)||!['REVISION_CONFLICT','ENTITY_CONFLICT'].includes(error.code)||!await reusableRun(ctx,key))throw error;result=await commit();}
 await ctx.jobs.send({kind:'intelligence.run',runId:result.value.id,workspaceId:ctx.actor.workspaceId});return result;
}
export async function controlRun(ctx:FeatureContext,input:{id:string;operationKey:string;expectedRevisionId:string;action:'pause'|'resume'|'cancel';reason?:string;continuationGrantId?:string}){
 const run=await requireRun(ctx,input.id,true);
 if(input.action!=='cancel')requireFreshRunAuthority(run);
 if(terminal(run.status))throw new ApiProblem(409,'TERMINAL_RUN','A terminal run cannot resume. Start a linked successor.');
 if(input.action==='resume'&&run.status!=='paused')throw new ApiProblem(409,'RUN_NOT_PAUSED','Only a paused run can resume.');
 let resumeKey:string|undefined;
 if(input.action==='resume'){
  const original=JSON.parse(run.input_json);const key=await equivalenceKey(ctx,requestSchema.parse(Object.fromEntries(Object.entries(original).filter(([key])=>key in requestSchema.shape))),{parentRunId:run.parent_id,evaluationCaseSetId:original.evaluationCaseSetId??null,parentInquiryId:original.parentInquiryId??null,ambientEventId:original.ambientEventId??null});resumeKey=key;const equivalent=await reusableRun(ctx,key);
  if(equivalent&&equivalent.id!==run.id)throw new ApiProblem(409,'EQUIVALENT_RUN_ACTIVE','An equivalent authorized run already owns this work.');
  await reauthorizeRun(ctx,run);if(run.skill_revision_id){if(input.continuationGrantId)await requirePinnedSkillContinuation(ctx,run,input.continuationGrantId);else await requireActiveSkill(ctx,run.skill_revision_id,JSON.parse(run.refs_json),JSON.parse(run.audience_json),run.reserved_micros);}
 }
 const status=input.action==='pause'?'paused':input.action==='resume'?(run.output_json?'needs-review':'queued'):'cancelled';
 const newReservation=input.action==='resume'&&!run.output_json?[...reserveBudget(ctx,run.id,run.reserved_micros,JSON.parse(run.input_json).route,run.skill_revision_id??undefined),...reserveAttention(ctx,run.id,`${run.id}:${input.expectedRevisionId}`)]:[];
 const result=await commitOperation(ctx,{operationKey:input.operationKey,action:`runs.${input.action}`,request:input,authorize:async()=>{await requireRun(ctx,input.id,true);},prepare:async({revisionId})=>({entity:{id:input.id,kind:'run',revisionId},value:{id:input.id,status,revisionId},statements:[...(resumeKey?bindEquivalence(ctx,resumeKey,run.id):[]),mutationGuard(ctx.db,"SELECT revision_id=? AND status NOT IN ('completed','failed','cancelled') FROM intelligence_runs WHERE id=?",[input.expectedRevisionId,input.id]),...(['paused','cancelled'].includes(status)&&run.status==='running'?interruptAttempt(ctx.db,run,ctx.now,status):[]),ctx.db.prepare('UPDATE intelligence_runs SET status=?,revision_id=?,failure_reason=?,lease_id=NULL,deadline_at=NULL,updated_at=?,settled_at=? WHERE id=?').bind(status,revisionId,input.reason??null,ctx.now,status==='cancelled'?ctx.now:null,input.id),...(status==='paused'?[settleBudget(ctx,input.id,run.cost_micros),releaseAttention(ctx,input.id)]:[]),...newReservation,...(input.continuationGrantId?[ctx.db.prepare("UPDATE intelligence_runs SET input_json=json_set(input_json,'$.continuationGrantId',?) WHERE id=?").bind(input.continuationGrantId,run.id)]:[]),...(status==='cancelled'?[releaseAttention(ctx,input.id),ctx.db.prepare("UPDATE intelligence_effects SET state='cancelled' WHERE run_id=? AND state='prepared'").bind(input.id),settleBudget(ctx,input.id,run.cost_micros)]:[]),revision(ctx,revisionId,'run',input.id,{status,reason:input.reason??null})]})});
 if(status==='queued')await ctx.jobs.send({kind:'intelligence.run',runId:input.id,workspaceId:ctx.actor.workspaceId});return result;
}
export async function reviewRun(ctx:FeatureContext,input:{id:string;operationKey:string;expectedRevisionId:string;outcome:'accepted'|'discarded'}){
 const run=await requireRun(ctx,input.id,true);await reauthorizeRun(ctx,run,false);
 if(!run.output_json)throw new ApiProblem(409,'NO_PROPOSAL','This run has no reviewable proposal.');const output=JSON.parse(run.output_json);
 if(input.outcome==='accepted'&&run.kind==='procedure'){
  const pending=await ctx.db.prepare("SELECT COUNT(*) n FROM intelligence_effects WHERE run_id=? AND state<>'confirmed'").bind(run.id).first<number>('n');
  const tasks=await ctx.db.prepare("SELECT COUNT(*) total,SUM(CASE WHEN state='completed' THEN 1 ELSE 0 END) done FROM intelligence_guided_tasks WHERE run_id=?").bind(run.id).first<{total:number;done:number}>();
  if(pending||!tasks?.total||tasks.done!==tasks.total)throw new ApiProblem(409,'PROCEDURE_UNCONFIRMED','Complete the real guided steps and confirm every required effect before accepting this work.');
 }
 if(input.outcome==='accepted'&&output.answer?.proposedChanges?.length)throw new ApiProblem(409,'SELECT_CHANGES','Apply selected changes through the page suggestion API before completing this proposal.');
 return commitOperation(ctx,{operationKey:input.operationKey,action:'runs.review',request:input,authorize:async()=>{await requireRun(ctx,input.id,true);await reauthorizeRun(ctx,run,false);},prepare:async({revisionId})=>{if(input.outcome==='accepted')await reauthorizeRun(ctx,run);return {entity:{id:input.id,kind:'run',revisionId},value:{id:input.id,status:'completed',outcome:input.outcome,revisionId},statements:[mutationGuard(ctx.db,"SELECT revision_id=? AND status='needs-review' FROM intelligence_runs WHERE id=?",[input.expectedRevisionId,input.id]),ctx.db.prepare("UPDATE intelligence_runs SET status='completed',revision_id=?,failure_reason=NULL,settled_at=?,updated_at=? WHERE id=?").bind(revisionId,ctx.now,ctx.now,input.id),ctx.db.prepare('INSERT INTO intelligence_reviews(id,run_id,actor_id,outcome,detail_json,created_at) VALUES(?,?,?,?,?,?)').bind(id(),input.id,ctx.actor.id,input.outcome,'{}',ctx.now),settleBudget(ctx,input.id,run.cost_micros),revision(ctx,revisionId,'run',input.id,input)]};}});
}

export async function startSuccessor(ctx:FeatureContext,priorId:string,input:AskInput,config:{demo?:boolean;apiKey?:string;localUrl?:string;localToken?:string}){
 const prior=await requireRun(ctx,priorId,true);if(!terminal(prior.status))throw new ApiProblem(409,'PRIOR_RUN_ACTIVE','Stop the earlier run before creating a successor.');
 const ambiguous=await ctx.db.prepare("SELECT id FROM intelligence_effects WHERE run_id=? AND state IN ('dispatched','uncertain') LIMIT 1").bind(priorId).first();if(ambiguous)throw new ApiProblem(409,'RECONCILIATION_REQUIRED','Resolve the earlier uncertain effect before successor execution.');
 return startRun(ctx,input,config,priorId);
}
