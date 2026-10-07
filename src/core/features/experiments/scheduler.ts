import {dispatchCommittedNotifications} from '../notifications/dispatch';
import type {AppBindings} from '../../app/types';
import {ApiProblem} from '../../app/problems';
import {audienceContext} from '../ai/evidence';
import {executeTrial} from './execution';
import {collectMeasurements} from './measurement';
import {concludeTrial,trialPlanSchema} from './service';
import {notificationStatements} from '../notifications/events';
import {id} from '../ai/persistence';
export async function scheduleTrials(env:AppBindings,now:string){
 const rows=await env.DB.prepare("SELECT e.*,i.owner_id,i.page_id FROM intelligence_experiments e JOIN intelligence_inquiries i ON i.id=e.inquiry_id WHERE e.state IN ('active','stopped') LIMIT 100").all<{id:string;workspace_id:string;owner_id:string;page_id:string;plan_json:string;revision_id:string;state:string}>();
 for(const trial of rows.results){const base={db:env.DB,files:env.FILES,jobs:env.JOBS,now,sourceSecret:env.CONNECTOR_CREDENTIALS_KEY,actor:{id:trial.owner_id,workspaceId:trial.workspace_id,workspaceName:'',displayName:'',email:'',initials:'',role:'member' as const}};let ctx;try{ctx=await audienceContext(base,trial.owner_id);}catch{continue;}const plan=trialPlanSchema.parse(JSON.parse(trial.plan_json));
 try{if(now>=plan.endsAt){await concludeTrial(ctx,{id:trial.id,operationKey:`trial-conclude:${trial.id}`,expectedRevisionId:trial.revision_id,instrumentationRevision:plan.instrumentationRevision});continue;}
 if(trial.state!=='active'||now<plan.startsAt)continue;
 const run=await env.DB.prepare("SELECT status FROM intelligence_runs WHERE workspace_id=? AND json_extract(input_json,'$.trialId')=? LIMIT 1").bind(trial.workspace_id,trial.id).first<{status:string}>();if(plan.effects.length&&(!run||run.status==='running'))await executeTrial(ctx,trial.id);
 await collectMeasurements(ctx,trial.id);
 }catch(error){if(error instanceof ApiProblem&&[403,404].includes(error.status))continue;const reason=error instanceof ApiProblem?error.code:'TRIAL_STAGE_FAILED';await env.DB.batch(notificationStatements(ctx,{id:`trial-attention:${trial.id}:${reason}`,event:'experiment-result',pageId:trial.page_id,recipientIds:[trial.owner_id],actorId:null,detail:{experimentId:trial.id,outcome:reason}}));await dispatchCommittedNotifications(ctx);}
 }
}
