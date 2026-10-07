import {releaseAttention} from './attention';
import {dispatchCommittedNotifications} from '../notifications/dispatch';
import {runEventStatements} from './events';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {mutationGuard} from '../../app/operations';
import {reauthorizeRun,requireRun} from './repository';
import type {Answer,RunRow} from '../ai/contracts';
import {settleBudget} from '../ai/budget';
export async function finalizeRun(ctx:FeatureContext,runId:string,config:{apiKey?:string;localUrl?:string;localToken?:string}){
 const row=await ctx.db.prepare('SELECT * FROM intelligence_runs WHERE id=? AND workspace_id=? AND requester_id=?').bind(runId,ctx.actor.workspaceId,ctx.actor.id).first<RunRow>();if(!row)return;if(row.status!=='needs-review'||row.stage!=='finalizing'||!row.output_json)return;
 try{
 await requireRun(ctx,runId,true);
 const packet=await reauthorizeRun(ctx,row),output=JSON.parse(row.output_json) as {answer:Answer};
  if(JSON.parse(row.input_json).ambientEventId){const {completeAmbientEvent}=await import('../inquiries/ambient-result');await completeAmbientEvent(ctx,row,output.answer,config);}
  if(row.kind==='investigation'&&output.answer.researchPlan){const {materializeInquiry}=await import('../inquiries/planner');const materialized=await materializeInquiry(ctx,row.id,config);await ctx.db.prepare("UPDATE intelligence_runs SET output_json=? WHERE id=? AND status='needs-review'").bind(JSON.stringify({...output,inquiryId:materialized.inquiryId}),row.id).run();}
  if(output.answer.hypothesisAssessment){const hypothesis=await ctx.db.prepare('SELECT id,inquiry_id FROM intelligence_hypotheses WHERE run_id=?').bind(row.id).first<{id:string;inquiry_id:string}>();if(hypothesis){const {recordFinding}=await import('../inquiries/service');const finding=output.answer.hypothesisAssessment;await recordFinding(ctx,{id:hypothesis.inquiry_id,operationKey:`inquiry-finding:${row.id}`,hypothesisId:hypothesis.id,status:finding.status,finding:finding.conclusion,kind:'deduction',refs:finding.evidenceIds.map(e=>packet[Number(e.slice(1))-1]!.ref)});}}
  await reauthorizeRun(ctx,row);await ctx.db.batch([mutationGuard(ctx.db,"SELECT status='needs-review' AND stage='finalizing' FROM intelligence_runs WHERE id=?",[row.id]),ctx.db.prepare("UPDATE intelligence_runs SET status='completed',stage='complete',failure_reason=NULL,settled_at=?,updated_at=? WHERE id=?").bind(ctx.now,ctx.now,row.id),settleBudget(ctx,row.id,row.cost_micros),releaseAttention(ctx,row.id)]);
 }catch(error){await ctx.db.batch([...runEventStatements(ctx,row,'run-failed',error instanceof ApiProblem?error.code:'FOLLOW_THROUGH_FAILED'),ctx.db.prepare("UPDATE intelligence_runs SET status='failed',failure_reason=?,settled_at=?,updated_at=? WHERE id=? AND status='needs-review' AND stage='finalizing'").bind(error instanceof ApiProblem?error.code:'FOLLOW_THROUGH_FAILED',ctx.now,ctx.now,row.id),settleBudget(ctx,row.id,row.cost_micros),releaseAttention(ctx,row.id)]);await dispatchCommittedNotifications(ctx);}
}
