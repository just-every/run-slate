import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {mutationGuard} from '../../app/operations';

/** Old prepared workflows are evidence, not qualification for a new activation. */
export function assertPreparedCriteria(execution:Record<string,unknown>,criteria:string[],required=false){
 const prepared=required||['candidateRunId','genericRunId','judgeRunId','evaluationId','criteria','needsJudge'].some(key=>key in execution);
 if(prepared&&(execution.needsJudge!==true||JSON.stringify(execution.criteria)!==JSON.stringify(criteria)))
  throw new ApiProblem(409,'FRESH_EVALUATION_REQUIRED','This historical prepared evaluation lacks the immutable success criteria. Prepare a fresh judged evaluation.');
 return prepared;
}

export async function requirePreparedCriteria(ctx:FeatureContext,id:string,execution:Record<string,unknown>,criteria:string[]){
 const run=await ctx.db.prepare("SELECT 1 FROM intelligence_runs WHERE workspace_id=? AND json_extract(input_json,'$.evaluationCaseSetId')=? AND json_extract(input_json,'$.operationKey')=? LIMIT 1").bind(ctx.actor.workspaceId,id,`evaluation-candidate:${id}`).first();
 return assertPreparedCriteria(execution,criteria,Boolean(run));
}

/** Qualify the actual evaluation behind activation, including old completed receipts. */
export async function requireActivationAssessment(ctx:FeatureContext,revisionId:string,evaluationId:string|null){
 if(!evaluationId)return [];
 const evaluation=await ctx.db.prepare('SELECT result_json FROM intelligence_evaluations WHERE id=? AND workspace_id=? AND skill_revision_id=?').bind(evaluationId,ctx.actor.workspaceId,revisionId).first<{result_json:string}>();
 if(!evaluation)throw new ApiProblem(409,'EVALUATION_REQUIRED','A retained passing evaluation is required.');
 // New results retain the case ID. Older results retain candidate run IDs, whose
 // immutable request still identifies the prepared case even if execution is stale.
 const cases=(await ctx.db.prepare(`SELECT DISTINCT c.id,c.execution_json FROM intelligence_evaluation_cases c
 WHERE c.workspace_id=? AND c.skill_revision_id=? AND (
 c.id=json_extract(?,'$.caseSetId') OR json_extract(c.execution_json,'$.evaluationId')=? OR
 EXISTS (SELECT 1 FROM intelligence_runs r JOIN json_each(?,'$.results') result
 ON r.id=json_extract(result.value,'$.candidate.runId')
 WHERE r.workspace_id=c.workspace_id AND json_extract(r.input_json,'$.evaluationCaseSetId')=c.id))`).bind(ctx.actor.workspaceId,revisionId,evaluation.result_json,evaluationId,evaluation.result_json).all<{id:string;execution_json:string}>()).results;
 const {requirePreparedEvaluationAssessment}=await import('./evaluation-workflow');
 for(const row of cases)await requirePreparedEvaluationAssessment(ctx,row.id);
 return [mutationGuard(ctx.db,'SELECT result_json=? FROM intelligence_evaluations WHERE id=?',[evaluation.result_json,evaluationId]),...cases.map(row=>mutationGuard(ctx.db,'SELECT execution_json=? FROM intelligence_evaluation_cases WHERE id=?',[row.execution_json,row.id]))];
}
