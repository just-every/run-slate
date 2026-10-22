// Controlled retained-data regression mechanics; no real provider or quality claim.
import {env} from 'cloudflare:test';
import {afterEach,expect,test,vi} from 'vitest';
import {fixture} from './fixture';
import {prepareEvaluation,evaluationStatus,completeEvaluation,requirePreparedEvaluationAssessment} from '../../../src/core/features/skills/evaluation-workflow';
import {evaluateSkill} from '../../../src/core/features/skills/evaluations';
import {transitionSkill,activateRoutineRefinement} from '../../../src/core/features/skills/service';
import {issueGrant} from '../../../src/core/features/effects/grants';
import {freezeCases} from '../../../src/core/features/skills/cases';

afterEach(()=>vi.unstubAllGlobals());
const provider={apiKey:'test-only'};
test('SKILL-002 legacy literal, missing and empty prepared cases refuse every path and preserve history',async()=>{
 for(const kind of ['literal','missing','empty']){
 try {

 const f=await fixture(),draft=await f.refine(`legacy-${kind}-draft`);
 const input={operationKey:`legacy-${kind}-prepared`,revisionId:draft.value.revisionId,expectedOutcome:'The source is available.'};
 const prepared=await prepareEvaluation(f.context(),f.original.value.id,input,provider),row=await evaluationStatus(f.context(),prepared.id);
 const execution=kind==='empty'?{}:{...row.execution,criteria:kind==='missing'?undefined:['The source is available.'],needsJudge:kind==='missing'?undefined:false};
 await env.DB.prepare('UPDATE intelligence_evaluation_cases SET execution_json=? WHERE id=?').bind(JSON.stringify(execution),prepared.id).run();
 // Retained old result lacks the new explicit caseSetId and the execution evaluationId.
 const evaluationId=`historical-${kind}-evaluation`,result={cutoff:row.cutoff,results:[{candidate:{runId:prepared.candidateRunId}}]};
 await env.DB.prepare('INSERT INTO intelligence_evaluations(id,workspace_id,skill_revision_id,case_hash,result_json,passed,created_at) VALUES(?,?,?,?,?,1,?)').bind(evaluationId,f.workspaceId,draft.value.revisionId,'retained-historical-case',JSON.stringify(result),f.context().now).run();
 await env.DB.prepare("UPDATE intelligence_skill_versions SET state='evaluated',evaluation_id=? WHERE id=?").bind(evaluationId,draft.value.revisionId).run();
 await issueGrant(f.context(),{operationKey:`legacy-${kind}-standing-grant`,subjectId:f.owner,kind:'skill',expiresAt:new Date(Date.parse(f.context().now)+3600000).toISOString(),scope:{operations:['skill.activate'],targets:[f.original.value.id],accounts:[],sourceIds:f.refs.map(r=>r.sourceId),audience:[f.owner],maxCostMicros:f.definition.maxCostMicros,conditions:{},acceptNonAtomicProvider:false}});
 const snapshot=async()=>JSON.stringify((await env.DB.batch([
  env.DB.prepare('SELECT * FROM intelligence_evaluation_cases WHERE id=?').bind(prepared.id),
  env.DB.prepare('SELECT * FROM intelligence_evaluations WHERE id=?').bind(evaluationId),
  env.DB.prepare('SELECT * FROM intelligence_skill_versions WHERE id=?').bind(draft.value.revisionId),
  env.DB.prepare('SELECT * FROM operation_receipts ORDER BY id'),
 ])).map(result=>result.results));
 const before=await snapshot(),count=await env.DB.prepare('SELECT count(*) n FROM intelligence_runs').first<number>('n');
 const refused={code:'FRESH_EVALUATION_REQUIRED'};
 await expect(prepareEvaluation(f.context(),f.original.value.id,input,provider)).rejects.toMatchObject(refused);
 await expect(evaluationStatus(f.context(),prepared.id)).rejects.toMatchObject(refused);
 await expect(completeEvaluation(f.context(),prepared.id,provider)).rejects.toMatchObject(refused);
 await expect(requirePreparedEvaluationAssessment(f.context(),prepared.id)).rejects.toMatchObject(refused);
 await expect(evaluateSkill(f.context(),{operationKey:`legacy-${kind}-direct`,revisionId:draft.value.revisionId,caseSetId:prepared.id,cutoff:row.cutoff,cases:[{...row.cases[0]!,candidateRunId:prepared.candidateRunId,genericRunId:prepared.genericRunId,expertRunId:'historical-expert',candidateOwnerSeconds:1,genericOwnerSeconds:1,expertOwnerSeconds:1}]})).rejects.toMatchObject(refused);
 await expect(transitionSkill(f.context(),{operationKey:`legacy-${kind}-activate`,revisionId:draft.value.revisionId,action:'activate'})).rejects.toMatchObject(refused);
 await expect(activateRoutineRefinement(f.context(),draft.value.revisionId)).rejects.toMatchObject(refused);
 expect(await snapshot()).toBe(before);
 expect(await env.DB.prepare('SELECT count(*) n FROM intelligence_runs').first<number>('n')).toBe(count);
 expect(await env.DB.prepare('SELECT current_revision_id FROM intelligence_skills WHERE id=?').bind(f.original.value.id).first<string>('current_revision_id')).toBe(f.original.value.revisionId);
 } finally { vi.unstubAllGlobals(); }
 }
},60000);

test('SKILL-002 completed and activated replay requalifies assessment without changing old receipts',async()=>{
 const f=await fixture(),row=await evaluationStatus(f.context(),f.prepared.id);
 const activation={operationKey:'activate-original',revisionId:f.original.value.revisionId,action:'activate' as const};
 const receipt=await env.DB.prepare('SELECT response_json FROM operation_receipts WHERE operation_key=?').bind(activation.operationKey).first<string>('response_json');
 expect((await transitionSkill(f.context(),activation)).value.state).toBe('active');
 await env.DB.prepare("UPDATE intelligence_evaluation_cases SET execution_json=json_set(execution_json,'$.needsJudge',json('false')) WHERE id=?").bind(row.id).run();
 await expect(completeEvaluation(f.context(),row.id)).rejects.toMatchObject({code:'FRESH_EVALUATION_REQUIRED'});
 await expect(prepareEvaluation(f.context(),f.original.value.id,{operationKey:'original-comparison',revisionId:f.original.value.revisionId},provider)).rejects.toMatchObject({code:'FRESH_EVALUATION_REQUIRED'});
 await expect(transitionSkill(f.context(),activation)).rejects.toMatchObject({code:'FRESH_EVALUATION_REQUIRED'});
 expect(await env.DB.prepare('SELECT response_json FROM operation_receipts WHERE operation_key=?').bind(activation.operationKey).first<string>('response_json')).toBe(receipt);
 // Metadata claiming a judge is required is not itself a completed judge.
 await env.DB.prepare("UPDATE intelligence_evaluation_cases SET execution_json=json_remove(json_set(execution_json,'$.needsJudge',json('true')),'$.judgeRunId') WHERE id=?").bind(row.id).run();
 await expect(completeEvaluation(f.context(),row.id)).rejects.toMatchObject({code:'OUTCOME_ASSESSMENT_REQUIRED'});
 await expect(transitionSkill(f.context(),activation)).rejects.toMatchObject({code:'OUTCOME_ASSESSMENT_REQUIRED'});
},60000);

test('SKILL-002 separate manual frozen case remains readable without fabricated workflow metadata',async()=>{
 const f=await fixture(),draft=await f.refine('manual-case-draft');
 const frozen=await freezeCases(f.context(),{operationKey:'manual-frozen-case',revisionId:draft.value.revisionId,cutoff:f.context().now,refs:f.refs,cases:[{name:'Manual',question:'Independent question',requiredEvidenceIds:['E1'],requiredStatements:[],forbiddenStatements:[],maximumOwnerSeconds:10}]});
 expect((await evaluationStatus(f.context(),frozen.value.id)).execution).toEqual({});
 expect(await requirePreparedEvaluationAssessment(f.context(),frozen.value.id)).toBeNull();
},60000);
