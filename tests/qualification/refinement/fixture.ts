// Controlled protocol outcomes only: no inference, real expert, or value claim.
import {env} from 'cloudflare:test';
import {vi,expect} from 'vitest';
import {fixture as base,answer,providerResponse} from '../inquiry/fixture';
import {createSkill,transitionSkill} from '../../../src/core/features/skills/service';
import {prepareEvaluation,recordEvaluationAttention,recordEvaluationBaseline,completeEvaluation} from '../../../src/core/features/skills/evaluation-workflow';
import {consumeIntelligenceJob} from '../../../src/core/features/runs/worker';
import type {AppBindings} from '../../../src/core/app/types';
export async function fixture(){
 const f=await base();
 const definition={instructions:'Use every exact authorized source. This is a controlled protocol test.',refs:f.refs,audience:[f.owner],tools:['read-evidence' as const],effects:[],preconditions:['Current source'],successTests:['Identify unresolved handoff'],escalations:['Unknown authority'],maxCostMicros:100000};
 const original=await createSkill(f.context(),{operationKey:'original-method',pageId:f.page.pageId,name:'Refinable method',definition});
 const prepared=await prepareEvaluation(f.context(),original.value.id,{operationKey:'original-comparison',revisionId:original.value.revisionId},{apiKey:'test-only'});
 await compare(f,prepared,definition.successTests,true);
 await transitionSkill(f.context(),{operationKey:'activate-original',revisionId:original.value.revisionId,action:'activate'});
 const refine=async(key:string,changes={})=>createSkill(f.context(),{operationKey:key,pageId:f.page.pageId,name:'Refinable method',definition:{...definition,...changes},skillId:original.value.id,expectedRevisionId:original.value.revisionId});
 return {...f,definition,original,prepared,refine};
}
export async function compare(f:Awaited<ReturnType<typeof base>>,prepared:Awaited<ReturnType<typeof prepareEvaluation>>,criteria:string[],passed:boolean){
 const binding={...env,AI_API_KEY:'test-only'} as AppBindings;
 vi.stubGlobal('fetch',async()=>providerResponse(answer));
 for(const runId of [prepared.candidateRunId,prepared.genericRunId])await consumeIntelligenceJob(binding,{kind:'intelligence.run',workspaceId:f.workspaceId,runId});
 await recordEvaluationAttention(f.context(),prepared.id,{operationKey:`attention-${prepared.id}`,candidateOwnerSeconds:12,genericOwnerSeconds:20});
 await recordEvaluationBaseline(f.context(),prepared.id,{operationKey:`baseline-${prepared.id}`,result:'The source is available.',method:'Controlled test-only independent protocol fixture',startedAt:prepared.startedAt,ownerSeconds:25,toolCostMicros:0});
 const judge=await completeEvaluation(f.context(),prepared.id,{apiKey:'test-only'});
 vi.stubGlobal('fetch',async()=>providerResponse({...answer,evaluationAssessment:{criteria:criteria.map(criterion=>({criterion,candidatePassed:passed,genericPassed:true,expertPassed:true,explanation:'Controlled mechanics, no empirical quality claim.',evidenceIds:['E1']}))}}));
 await consumeIntelligenceJob(binding,{kind:'intelligence.run',workspaceId:f.workspaceId,runId:judge.judgeRunId!});
 if(passed)expect(await completeEvaluation(f.context(),prepared.id)).toMatchObject({state:'completed',passed:true});
 else await expect(completeEvaluation(f.context(),prepared.id)).rejects.toMatchObject({code:'OUTCOME_ASSESSMENT_FAILED'});
}
