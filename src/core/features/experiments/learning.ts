import {trialLearningRefs} from './disclosure';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {commitOperation,mutationGuard} from '../../app/operations';
import {revision} from '../ai/persistence';
import {requireInquiry} from '../inquiries/service';
import {createSkill} from '../skills/service';
import {requireTrial,trialPlanSchema} from './service';
/** Learning is a draft with retained provenance, never an activation or policy grant. */
export async function prepareLearnedSkill(ctx:FeatureContext,input:{id:string;operationKey:string;expectedRevisionId:string}){
 const trial=await requireTrial(ctx,input.id,true),inquiry=await requireInquiry(ctx,trial.inquiry_id,true);
 if(trial.state!=='completed'||!trial.outcome_json||trial.revision_id!==input.expectedRevisionId)throw new ApiProblem(409,'CONCLUDED_TRIAL_REQUIRED','Use the current concluded trial before preparing its learned method.');
 const plan=trialPlanSchema.parse(JSON.parse(trial.plan_json)),outcome=JSON.parse(trial.outcome_json);
 const learned=await ctx.db.prepare("SELECT content_json FROM intelligence_revisions WHERE id=? AND workspace_id=? AND entity_kind='learned-method'").bind(trial.revision_id,ctx.actor.workspaceId).first<{content_json:string}>();
 if(!learned)throw new ApiProblem(409,'LEARNING_PROVENANCE_REQUIRED','The retained method revision is missing.');
 const hypotheses=(await ctx.db.prepare('SELECT statement,disconfirmation,status FROM intelligence_hypotheses WHERE inquiry_id=? ORDER BY id').bind(inquiry.id).all()).results;
 const skill=await createSkill(ctx,{operationKey:input.operationKey+':draft',pageId:inquiry.page_id,name:inquiry.question.slice(0,160),definition:{
  instructions:JSON.stringify({task:inquiry.question,methodRevision:trial.revision_id,trialId:trial.id,originalForecast:plan.forecast,population:plan.eligibility,assignmentMethod:plan.assignmentMethod,baseline:plan.baseline,metric:plan.metric,outcome,hypotheses,method:JSON.parse(learned.content_json)}),
  refs:await trialLearningRefs(ctx,trial,inquiry),audience:JSON.parse(inquiry.audience_json),tools:['read-evidence','calculate','propose'],effects:[],
  preconditions:['Recheck every source revision, access grant, population and applicability before reuse.','The retained result is specific to its declared population and elapsed trial window.','No policy, entitlement, commercial or external-effect authority is created by this learning.'],
  successTests:['Keep the original forecast, rival and disconfirmed hypotheses and outcome visible.','Reproduce the retained analysis with the original inputs and checker version.','Evaluate against held-out cases, an expert baseline and a capable generic method before activation.','Measure all-attempt cost, elapsed time and human attention on repeated work.'],
  escalations:['Seek new evidence when scope, assumptions or precision do not support transfer.','Stop an adverse intervention; any recovery needs separate authorization.'],maxCostMicros:Math.max(1,plan.maximumCostMicros)
 }});
 return commitOperation(ctx,{operationKey:input.operationKey,action:'experiments.learned-skill',request:input,authorize:async()=>{await requireTrial(ctx,input.id,true);},prepare:async({revisionId})=>({entity:{id:trial.id,kind:'experiment-learning',revisionId},value:{skillId:skill.value.id,skillRevisionId:skill.value.revisionId,methodRevisionId:trial.revision_id,state:'draft'},statements:[mutationGuard(ctx.db,"SELECT revision_id=? AND state='completed' FROM intelligence_experiments WHERE id=?",[input.expectedRevisionId,trial.id]),revision(ctx,revisionId,'experiment-learning',trial.id,{methodRevisionId:trial.revision_id,skillId:skill.value.id,skillRevisionId:skill.value.revisionId,activated:false})]})});
}
