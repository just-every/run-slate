import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {requireRun} from '../runs/repository';
import type {Answer,EvidenceInput} from '../ai/contracts';
import {createGuidedTask} from './guided';
import {procedureSteps} from './guided-definition';
import {createSkill} from './service';
export async function prepareProcedure(ctx:FeatureContext,runId:string,input:{operationKey:string}){
 const run=await requireRun(ctx,runId,true);
 if(run.kind!=='procedure'||!run.output_json||!['needs-review','completed'].includes(run.status))throw new ApiProblem(409,'PROCEDURE_NOT_READY','The grounded procedure is not ready.');
 const answer=(JSON.parse(run.output_json) as {answer:Answer}).answer,refs=JSON.parse(run.refs_json) as EvidenceInput[];
 if(!answer.procedurePlan)throw new ApiProblem(409,'PROCEDURE_PLAN_REQUIRED','Generate an executable grounded procedure with owning-system verification for observable steps.');
 const steps=await procedureSteps(ctx,run);
 const guided=await createGuidedTask(ctx,{operationKey:`${input.operationKey}:guide`,runId,steps});
 const skill=await createSkill(ctx,{operationKey:`${input.operationKey}:skill`,pageId:run.page_id,name:JSON.parse(run.input_json).question.slice(0,160),definition:{instructions:steps.map((s,i)=>`${i+1}. ${s.instruction}`).join('\n'),refs,audience:JSON.parse(run.audience_json),tools:['read-evidence','propose'],effects:[],preconditions:['Source revisions remain current and authorized.'],successTests:['Every guided step has a recorded confirmation from its responsible colleague.'],escalations:answer.unresolved,maxCostMicros:Math.max(1,run.reserved_micros)}});
 return {guidedTaskId:guided.value.id,skillId:skill.value.id,skillRevisionId:skill.value.revisionId,state:'draft'};
}
