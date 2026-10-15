// Labelled protocol fixture only. D1 authority, grounded procedures and guided commits are real.
import {vi} from 'vitest';
import {env} from 'cloudflare:test';
import {fixture,document} from '../authority/fixture';
import {connect} from '../../../src/core/features/connectors/service';
import {recordRouteEvaluation} from '../../../src/core/features/ai/route-evaluation';
import {setModelPolicy} from '../../../src/core/features/ai/model-policy';
import {answer,providerResponse} from '../inquiry/fixture';
import {startRun} from '../../../src/core/features/runs/service';
import {consumeIntelligenceJob} from '../../../src/core/features/runs/worker';
import {prepareProcedure} from '../../../src/core/features/skills/preparation';
import {guidedTask,verifyGuidedStep} from '../../../src/core/features/skills/guided';
import {addSource,refreshSource} from '../../../src/core/features/source-memory/service';
import type {AppBindings} from '../../../src/core/app/types';
export async function owningFixture(expectedState:'open'|'completed'|'cancelled'='open'){
 const base=await fixture(),host=await document(base,'Guided instruction source'),secret='test-only-owning-state-secret-32-characters';const f={...base,context:()=>({...base.context(),sourceSecret:secret}),refs:[host.ref],ask:{operationKey:'typed-procedure-request',pageId:host.id,question:'Observe exact handoff state',kind:'procedure' as const,refs:[host.ref],audience:[base.owner],frontier:true,maxOutputTokens:1024}};
 const identity={protocol:'rer-delegation/1',provider:'orbit',installationId:'test-installation',accountId:'account',principalId:'source-owner',label:'Protocol fixture',grantId:'source-grant',expiresAt:'2099-01-01T00:00:00Z',scopes:['crm.evidence.read'],targets:['opportunities/o'],capabilities:{readKinds:['crm.handoff'],operations:[],conditionalWrite:true,providerIdempotency:true,readBack:true,reconciliationAttribution:true}};
 const control={typed:true,state:expectedState,revision:'initial',observedAt:()=>new Date().toISOString(),calls:0,after:undefined as undefined|(()=>Promise<void>),alter:undefined as undefined|((value:any)=>void)};

 vi.stubGlobal('fetch',async(raw:string|URL|Request,init?:RequestInit)=>{
  const url=new URL(typeof raw==='string'?raw:raw instanceof URL?raw:raw.url);
  if(url.hostname==='api.openai.com')return providerResponse({...answer,procedurePlan:{steps:[{instruction:'Confirm exact owning state',evidenceIds:['E1'],verification:{kind:'owning-source',evidenceId:'E2',stateSchema:'crm.handoff-state/1',expectedState}}]}});
  if(url.origin==='https://native.test'){
   control.calls++;
   if(url.pathname.endsWith('/identity')){const value=identity;return Response.json({...value,scopes:['crm.evidence.read'],capabilities:{...value.capabilities,operations:[],...(control.typed?{recordStateSchemas:['crm.handoff-state/1']}:{})}});}
   if(url.pathname.endsWith('/evidence')||url.pathname.endsWith('/check')){
    const value:any={provider:'orbit',installationId:'test-installation',accountId:'account',principalId:'source-owner',target:url.searchParams.get('target'),revision:control.revision,observedAt:control.observedAt(),audience:{kind:'source-principals',principalIds:['source-owner']},...(new Headers(init?.headers).has('X-RER-Record-State-Schema')&&control.typed?{recordState:{schema:'crm.handoff-state/1',kind:'crm.handoff',state:control.state}}:{}),...(url.pathname.endsWith('/evidence')?{title:'Handoff',text:'Status: open',canonicalUrl:'https://native.test/app/opportunities/o'}:{})};
    control.alter?.(value);if(url.pathname.endsWith('/evidence'))await control.after?.();return Response.json(value);
   }
  }
  throw Error('Unexpected fixture request: '+url.href);
 });
 const connected=await connect(f.context(),{operationKey:'typed-connection',provider:'orbit',accountId:'account',token:'synthetic-protocol-fixture-token',nativeConfig:{origin:'https://native.test',accountId:'account',clientId:'slate',allowLoopback:false}},secret),connectionId=connected.value.id;
 await env.DB.prepare('UPDATE workspaces SET ai_enabled=1,ai_monthly_budget_micros=1000000 WHERE id=?').bind(f.workspaceId).run();
 const measuredContext=f.context();const measured=await recordRouteEvaluation(measuredContext,{operationKey:'typed-route-evaluation',provider:'openai',model:'protocol-fixture',task:'procedure',cutoff:'2020-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z',minimumFit:0.9,cases:[{caseId:'labelled-protocol-fixture',heldOut:true,observedAt:measuredContext.now,passed:true,costMicros:1,elapsedMs:1,receipt:'test-only',refs:f.refs}]});
 await setModelPolicy(f.context(),{operationKey:'typed-model-policy',policy:{attentionBudget:100,routes:[{provider:'openai',model:'protocol-fixture',role:'frontier',inputMicrosPerMillion:1000000,outputMicrosPerMillion:1000000,maxRunMicros:1000000,monthlyMicros:1000000,tasks:['procedure'],evaluationId:measured.value.id}]}});
 const source=await addSource(f.context(),{operationKey:'typed-source-create',connectionId,remoteId:'opportunities/o/handoffs/a'}),fresh=await refreshSource(f.context(),source.value.id,f.context().sourceSecret);
 const refs=[...f.refs,{kind:'source' as const,sourceId:source.value.id,revisionId:fresh.sourceRevisionId}],run=await startRun(f.context(),{...f.ask,refs,kind:'procedure',audience:[f.owner]},{apiKey:'test-only'});
 await consumeIntelligenceJob({...env,AI_API_KEY:'test-only',CONNECTOR_CREDENTIALS_KEY:f.context().sourceSecret} as AppBindings,{kind:'intelligence.run',workspaceId:f.workspaceId,runId:run.value.id});
 const prepared=await prepareProcedure(f.context(),run.value.id,{operationKey:'typed-prepare-procedure'}),task=await guidedTask(f.context(),prepared.guidedTaskId),stepId=task.steps[0]!.id;
 return {...f,control,connectionId,refs,runId:run.value.id,task,stepId,verify:(ctx=f.context())=>verifyGuidedStep(ctx,{operationKey:'typed-verify-owning',taskId:task.id,stepId}),state:()=>env.DB.prepare('SELECT state,receipt_json FROM intelligence_guided_steps WHERE id=?').bind(stepId).first<{state:string;receipt_json:string|null}>()};
}
