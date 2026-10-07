import {requireAmbientScope} from '../inquiries/ambient';
import {evaluationStatus} from '../skills/evaluation-workflow';
import {registerNotificationCreationEligibility, type CreationEligibility} from '../notifications/events';
import {requireSkill} from '../skills/activity';
import {guidedTask} from '../skills/guided';
import {requireWorkspaceOwner} from '../sharing/current-access';
import {registerActivityResolver} from '../activity/service';
import {registerNotificationVisibility} from '../notifications/visibility';
import {registerTodayResolver} from '../notifications/service';
import {requireRun} from '../runs/repository';
import {getDecision} from '../decisions/service';
import {requireInquiry} from '../inquiries/service';
import {requireTrial} from '../experiments/service';
import {requireEffect} from '../effects/service';
import type {FeatureContext} from '../../app/feature-context';
import type {NotificationDetail} from '../notifications/visibility';
const visible=async(fn:()=>Promise<unknown>)=>{try{await fn();return true;}catch{return false;}};
async function activeDecision(ctx:FeatureContext,id:string) {
 const row=await ctx.db.prepare('SELECT id FROM knowledge_decisions WHERE id=? AND workspace_id=? AND removed_at IS NULL').bind(id,ctx.actor.workspaceId).first();
 if(!row)throw new Error('Decision unavailable');
 const decision=await getDecision(ctx,id);
 if(decision.removed_at)throw new Error('Decision unavailable');
 return decision;
}
export function registerIntelligenceVisibility(){
 registerActivityResolver('skill',(ctx,id)=>visible(()=>requireSkill(ctx,id)));registerActivityResolver('guided-task',(ctx,id)=>visible(()=>guidedTask(ctx,id)));
 for(const kind of ['model-policy','agent-credential','action-grant','route-evaluation'])registerActivityResolver(kind,(ctx)=>visible(()=>requireWorkspaceOwner(ctx)));
 registerActivityResolver('analysis',(ctx,id)=>visible(async()=>{const row=await ctx.db.prepare('SELECT inquiry_id FROM intelligence_analyses WHERE id=?').bind(id).first<{inquiry_id:string}>();if(!row)throw new Error('Unavailable');await requireInquiry(ctx,row.inquiry_id);}));
 for(const [kind,table]of [['skill-evaluation','intelligence_evaluations'],['evaluation-cases','intelligence_evaluation_cases']] as const)registerActivityResolver(kind,(ctx,id)=>visible(async()=>{const row=await ctx.db.prepare(`SELECT v.skill_id FROM ${table} e JOIN intelligence_skill_versions v ON v.id=e.skill_revision_id WHERE e.id=? AND e.workspace_id=?`).bind(id,ctx.actor.workspaceId).first<{skill_id:string}>();if(!row)throw new Error('Unavailable');await requireSkill(ctx,row.skill_id);}));
 registerActivityResolver('ambient-scope',(ctx,id)=>visible(()=>requireAmbientScope(ctx,id)));registerActivityResolver('evaluation-attention',(ctx,id)=>visible(()=>evaluationStatus(ctx,id)));
 registerActivityResolver('run',(ctx,id)=>visible(()=>requireRun(ctx,id)));registerActivityResolver('decision',(ctx,id)=>visible(()=>getDecision(ctx,id)));registerActivityResolver('inquiry',(ctx,id)=>visible(()=>requireInquiry(ctx,id)));registerActivityResolver('experiment',(ctx,id)=>visible(()=>requireTrial(ctx,id)));registerActivityResolver('effect',(ctx,id)=>visible(()=>requireEffect(ctx,id)));
 for(const event of ['run-review','run-failed','decision-required','contradiction','experiment-result','maintenance'] as const){
  registerNotificationCreationEligibility(event,(member,fact)=>{
   const eligibility=intelligenceEligibility(member,fact);
   return fact.detail?.decisionId ? {sql:`(${eligibility.sql}) AND EXISTS(SELECT 1 FROM knowledge_decisions active WHERE active.id=? AND active.workspace_id=f.workspace AND active.removed_at IS NULL)`,values:[...eligibility.values,fact.detail.decisionId]} : eligibility;
  });
  registerNotificationVisibility(event,async(ctx,detail)=>{
   if(detail.decisionId&&!await visible(()=>activeDecision(ctx,detail.decisionId!)))return false;
   if(detail.runId)return visible(()=>requireRun(ctx,detail.runId!));
   if(detail.decisionId)return true;
   if(detail.inquiryId)return visible(()=>requireInquiry(ctx,detail.inquiryId!));
   if(detail.experimentId)return visible(()=>requireTrial(ctx,detail.experimentId!));
   return false;
  });
 }
 registerTodayResolver('run-review',async(ctx,notice)=>!!(notice.detail as NotificationDetail).runId&&(await requireRun(ctx,(notice.detail as NotificationDetail).runId!)).status==='needs-review');
 registerTodayResolver('run-failed',async(ctx,notice)=>!!(notice.detail as NotificationDetail).runId&&(await requireRun(ctx,(notice.detail as NotificationDetail).runId!)).status==='failed');
 registerTodayResolver('decision-required',async(ctx,notice)=>{const id=(notice.detail as NotificationDetail).decisionId;if(!id)return false;try{const decision=await activeDecision(ctx,id);return decision.state==='proposed'||decision.overdue;}catch{return false;}});
}

const intelligenceEligibility:CreationEligibility=(member,fact)=>{
 const detail=fact.detail;
 if(detail?.runId)return {sql:`EXISTS(SELECT 1 FROM intelligence_runs r WHERE r.id=? AND r.workspace_id=f.workspace AND (r.requester_id=${member}.id OR EXISTS(SELECT 1 FROM json_each(r.audience_json) a WHERE a.value=${member}.id)))`,values:[detail.runId]};
 if(detail?.decisionId)return {sql:`EXISTS(SELECT 1 FROM knowledge_decisions d WHERE d.id=? AND d.workspace_id=f.workspace AND d.owner_member_id=${member}.id)`,values:[detail.decisionId]};
 if(detail?.experimentId)return {sql:`EXISTS(SELECT 1 FROM intelligence_experiments e JOIN intelligence_inquiries i ON i.id=e.inquiry_id WHERE e.id=? AND e.workspace_id=f.workspace AND (i.owner_id=${member}.id OR EXISTS(SELECT 1 FROM json_each(i.audience_json) a WHERE a.value=${member}.id)))`,values:[detail.experimentId]};
 if(detail?.inquiryId)return {sql:`EXISTS(SELECT 1 FROM intelligence_inquiries i WHERE i.id=? AND i.workspace_id=f.workspace AND (i.owner_id=${member}.id OR EXISTS(SELECT 1 FROM json_each(i.audience_json) a WHERE a.value=${member}.id)))`,values:[detail.inquiryId]};
 return {sql:'0',values:[]};
};
