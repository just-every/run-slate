import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {requireRun} from '../runs/repository';
import type {Answer} from '../ai/contracts';
import {saveDecision} from './service';
/** A draft preserves the model's alternatives; only its named human owner accepts it. */
export async function prepareDecision(ctx:FeatureContext,runId:string,input:{operationKey:string}){
 const run=await requireRun(ctx,runId,true);if(!run.output_json||!['completed','needs-review'].includes(run.status))throw new ApiProblem(409,'RUN_NOT_READY','The evidence-backed findings are not ready.');
 const answer=(JSON.parse(run.output_json) as {answer:Answer}).answer;
 const options=answer.researchPlan?.hypotheses.map(h=>h.statement)??answer.proposedChanges.map(p=>p.text);
 if(!options.length)throw new ApiProblem(409,'NO_DECISION_ALTERNATIVES','This answer did not propose a business decision. Ask for alternatives first.');
 return saveDecision(ctx,{operationKey:input.operationKey,pageId:run.page_id,question:JSON.parse(run.input_json).question,options,outcome:'',rationale:answer.statements.map(s=>s.text).join('\n'),ownerId:ctx.actor.id,decidedAt:null,reviewAt:null,citations:JSON.parse(run.refs_json)});
}
