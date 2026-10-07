// Local provider protocol fixtures prove admission mechanics, not empirical quality.
import {env} from 'cloudflare:test';
import {afterEach,expect,test,vi} from 'vitest';
import {fixture,compare} from './fixture';
import {answer,providerResponse} from '../inquiry/fixture';
import {createApi} from '../../../src/core/app/hono';
import {sessionFor} from '../../e2e/setup/fixtures';
import {prepareEvaluation,evaluationStatus,completeEvaluation,recordEvaluationAttention,recordEvaluationBaseline} from '../../../src/core/features/skills/evaluation-workflow';
import {transitionSkill} from '../../../src/core/features/skills/service';
import {consumeIntelligenceJob} from '../../../src/core/features/runs/worker';
import {requireRun} from '../../../src/core/features/runs/repository';
import type {AppBindings} from '../../../src/core/app/types';

afterEach(()=>vi.unstubAllGlobals());
const provider={apiKey:'test-only'};
const expectedOutcome='The source is available.';

test('SKILL-002 supplied expectedOutcome cannot replace immutable criteria or activate without their typed assessment',async()=>{
 const f=await fixture(),draft=await f.refine('crafted-outcome-draft');
 const input={operationKey:'crafted-outcome',revisionId:draft.value.revisionId,expectedOutcome};
 const response=await createApi().request(`https://slate.example/api/skills/${f.original.value.id}/prepare-evaluation`,{method:'POST',headers:{Cookie:await sessionFor(f.owner),Origin:'https://slate.example','Content-Type':'application/json'},body:JSON.stringify(input)},{...env,AI_API_KEY:'test-only'});
 expect(response.status).toBe(200);
 const prepared=await response.json() as Awaited<ReturnType<typeof prepareEvaluation>>;
 const row=await evaluationStatus(f.context(),prepared.id);
 expect(row.execution).toMatchObject({criteria:f.definition.successTests,needsJudge:true});
 expect(row.cases[0]!.requiredStatements).toEqual([expectedOutcome]);
 const binding={...env,AI_API_KEY:'test-only'} as AppBindings;
 vi.stubGlobal('fetch',async()=>providerResponse(answer));
 for(const runId of [prepared.candidateRunId,prepared.genericRunId])await consumeIntelligenceJob(binding,{kind:'intelligence.run',workspaceId:f.workspaceId,runId});
 await recordEvaluationAttention(f.context(),prepared.id,{operationKey:'crafted-attention',candidateOwnerSeconds:12,genericOwnerSeconds:20});
 expect(await recordEvaluationBaseline(f.context(),prepared.id,{operationKey:'crafted-expert',result:expectedOutcome,method:'Test-only current-process protocol record',startedAt:prepared.startedAt,ownerSeconds:25,toolCostMicros:0})).toMatchObject({state:'awaiting-outcome-assessment'});
 await expect(transitionSkill(f.context(),{operationKey:'crafted-early-activate',revisionId:draft.value.revisionId,action:'activate'})).rejects.toMatchObject({code:'EVALUATION_REQUIRED'});
 const judge=await completeEvaluation(f.context(),prepared.id,provider);
 expect(judge.state).toBe('assessing-outcomes');
 const question=JSON.parse((await requireRun(f.context(),judge.judgeRunId!)).input_json).question;
 expect(question).toContain(JSON.stringify(f.definition.successTests));
 // Even a successful assessment of the caller's string omits the immutable criterion.
 vi.stubGlobal('fetch',async()=>providerResponse({...answer,evaluationAssessment:{criteria:[{criterion:expectedOutcome,candidatePassed:true,genericPassed:true,expertPassed:true,explanation:'Controlled fixture.',evidenceIds:['E1']}]}}));
 await consumeIntelligenceJob(binding,{kind:'intelligence.run',workspaceId:f.workspaceId,runId:judge.judgeRunId!});
 await expect(completeEvaluation(f.context(),prepared.id)).rejects.toMatchObject({code:'INVALID_OUTCOME_ASSESSMENT'});
 await expect(transitionSkill(f.context(),{operationKey:'crafted-final-activate',revisionId:draft.value.revisionId,action:'activate'})).rejects.toMatchObject({code:'EVALUATION_REQUIRED'});
 expect(await env.DB.prepare('SELECT current_revision_id FROM intelligence_skills WHERE id=?').bind(f.original.value.id).first<string>('current_revision_id')).toBe(f.original.value.revisionId);
 expect(await env.DB.prepare('SELECT count(*) n FROM intelligence_evaluations WHERE skill_revision_id=?').bind(draft.value.revisionId).first<number>('n')).toBe(0);
},60000);

test('SKILL-002 additive expectedOutcome retains full comparison, frozen request conflicts, and exact completed replay',async()=>{
 const f=await fixture(),draft=await f.refine('additive-outcome-draft');
 const input={operationKey:'additive-outcome',revisionId:draft.value.revisionId,expectedOutcome};
 let sends=0;
 const interrupted={...f.context(),jobs:{send:async()=>{sends++;throw Error('Controlled queue interruption');}} as unknown as ReturnType<typeof f.context>['jobs']};
 await expect(prepareEvaluation(interrupted,f.original.value.id,input,provider)).rejects.toThrow('Controlled queue interruption');
 const frozen=await env.DB.prepare('SELECT id,execution_json FROM intelligence_evaluation_cases WHERE skill_revision_id=?').bind(draft.value.revisionId).first<{id:string;execution_json:string}>();
 expect(JSON.parse(frozen!.execution_json)).toMatchObject({criteria:f.definition.successTests,needsJudge:true});expect(sends).toBe(1);
 const before=await env.DB.prepare('SELECT count(*) n FROM intelligence_runs WHERE workspace_id=?').bind(f.workspaceId).first<number>('n');
 await expect(prepareEvaluation(f.context(),f.original.value.id,{...input,expectedOutcome:'Changed literal'},provider)).rejects.toMatchObject({code:'OPERATION_KEY_CONFLICT'});
 expect(await env.DB.prepare('SELECT count(*) n FROM intelligence_runs WHERE workspace_id=?').bind(f.workspaceId).first<number>('n')).toBe(before);
 const prepared=await prepareEvaluation(f.context(),f.original.value.id,input,provider);
 expect(prepared.id).toBe(frozen!.id);
 await compare(f,prepared,f.definition.successTests,true);
 const status=await evaluationStatus(f.context(),prepared.id);
 expect([status.execution.candidateRunId,status.execution.genericRunId,status.execution.expertRunId,status.execution.judgeRunId].every(Boolean)).toBe(true);
 const count=await env.DB.prepare('SELECT count(*) n FROM intelligence_runs WHERE workspace_id=?').bind(f.workspaceId).first<number>('n');
 expect(await prepareEvaluation(f.context(),f.original.value.id,input,provider)).toMatchObject({id:prepared.id,state:'completed',evaluationId:status.execution.evaluationId,successTests:f.definition.successTests,startedAt:prepared.startedAt});
 expect(await env.DB.prepare('SELECT count(*) n FROM intelligence_runs WHERE workspace_id=?').bind(f.workspaceId).first<number>('n')).toBe(count);
 const activation={operationKey:'additive-activate',revisionId:draft.value.revisionId,action:'activate' as const};
 const result=await transitionSkill(f.context(),activation);expect(await transitionSkill(f.context(),activation)).toEqual(result);
 expect(await env.DB.prepare('SELECT current_revision_id FROM intelligence_skills WHERE id=?').bind(f.original.value.id).first<string>('current_revision_id')).toBe(draft.value.revisionId);
},60000);
