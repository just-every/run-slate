// Explicit test-only actors and measured-provider results. No live inference or paid acceptance is claimed.
import {fixture as base} from '../../flagship/intelligence/fixture';
import {recordRouteEvaluation} from '../../../src/core/features/ai/route-evaluation';
import {setModelPolicy} from '../../../src/core/features/ai/model-policy';
export async function fixture(){
 const f=await base(),routes=[];
 for(const task of ['answer','summary','investigation','procedure','routing','edit'])for(const role of task==='routing'?['frontier','fast'] as const:['frontier'] as const){
 const ctx=f.context();const evidence=await recordRouteEvaluation(ctx,{operationKey:`test-evaluation-${task}-${role}`,provider:'openai',model:`measured-test-${role}`,task,cutoff:'2020-01-01T00:00:00.000Z',expiresAt:'2099-01-01T00:00:00.000Z',minimumFit:0.9,cases:[{caseId:'test-held-out-case',heldOut:true,observedAt:ctx.now,passed:true,costMicros:100,elapsedMs:1,receipt:'test-only-provider-receipt',refs:f.refs}]});
 routes.push({provider:'openai' as const,model:`measured-test-${role}`,role,inputMicrosPerMillion:1000000,outputMicrosPerMillion:1000000,maxRunMicros:1000000,monthlyMicros:1000000,tasks:[task],evaluationId:evidence.value.id});}
 await setModelPolicy(f.context(),{operationKey:'test-measured-policy',policy:{attentionBudget:100,routes}});
 return {...f,routes};
}
export const answer={statements:[{text:'The source is available.',evidenceIds:['E1'],kind:'observation',limitations:[]}],unresolved:[],proposedChanges:[],researchPlan:null,hypothesisAssessment:null};
export const providerResponse=(value:unknown)=>Response.json({id:'test-only-provider-receipt',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}],usage:{input_tokens:10,output_tokens:10,total_tokens:20}});
