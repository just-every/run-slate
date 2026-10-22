beforeEach(resetDeployment);
import {resetDeployment} from '../../e2e/setup/reset-deployment';
import {test,expect,vi,afterEach,beforeEach} from 'vitest';
import {env} from 'cloudflare:test';
import {trialFixture} from '../inquiry/trial-fixture';
import {answer,providerResponse} from '../inquiry/fixture';
import {startRun} from '../../../src/core/features/runs/service';
import {consumeIntelligenceJob} from '../../../src/core/features/runs/worker';
import {guidedTask,verifyGuidedStep} from '../../../src/core/features/skills/guided';
import {prepareProcedure} from '../../../src/core/features/skills/preparation';
import {addSource,refreshSource} from '../../../src/core/features/source-memory/service';
import type {AppBindings} from '../../../src/core/app/types';
afterEach(()=>vi.unstubAllGlobals());
test('Journey 5 read-only native typed owning states complete and replay exact receipts',async()=>{
 for(const expectedState of ['open','completed','cancelled'] as const){
  await resetDeployment();
  try {

 const f=await trialFixture([8,8,8,8]);
 const nativeFetch=globalThis.fetch;
 const connectionId=(await env.DB.prepare('SELECT id FROM federation_connections WHERE workspace_id=?').bind(f.workspaceId).first<string>('id'))!;
 vi.stubGlobal('fetch',async(raw:string|URL|Request,init?:RequestInit)=>{
  const url=new URL(typeof raw==='string'?raw:raw instanceof URL?raw:raw.url);
  if(url.hostname==='api.openai.com')return providerResponse({...answer,procedurePlan:{steps:[{instruction:'Confirm the existing open handoff in its owning system.',evidenceIds:['E1'],verification:{kind:'owning-source',evidenceId:'E2',stateSchema:'crm.handoff-state/1',expectedState}}]}});
  if(url.origin==='https://native.test'&&url.pathname.endsWith('/identity')){const value=await (await nativeFetch(raw,init)).json() as any;return Response.json({...value,scopes:['crm.evidence.read'],capabilities:{...value.capabilities,operations:[],recordStateSchemas:['crm.handoff-state/1']}});}
  // Extension of the existing test-only native protocol fixture; no real provider request can escape.
  if(url.origin==='https://native.test'&&url.pathname.endsWith('/evidence'))return Response.json({provider:'orbit',installationId:'test-installation',accountId:'account',principalId:'source-owner',target:url.searchParams.get('target'),revision:'before',observedAt:new Date().toISOString(),audience:{kind:'source-principals',principalIds:['source-owner']},recordState:{schema:'crm.handoff-state/1',kind:'crm.handoff',state:expectedState},title:'Test handoff',text:'Status: open',canonicalUrl:'https://native.test/opportunities/o'});
  return nativeFetch(raw,init);
 });
 const added=await addSource(f.context(),{operationKey:'journey-native-source',connectionId,remoteId:'opportunities/o/handoffs/a'});
 const refreshed=await refreshSource(f.context(),added.value.id,f.context().sourceSecret);
 const refs=[...f.refs,{kind:'source' as const,sourceId:added.value.id,revisionId:refreshed.sourceRevisionId}];
 const run=await startRun(f.context(),{...f.ask,refs,kind:'procedure',audience:[f.owner]},{apiKey:'test-only'});
 await consumeIntelligenceJob({...env,AI_API_KEY:'test-only',CONNECTOR_CREDENTIALS_KEY:f.context().sourceSecret} as AppBindings,{kind:'intelligence.run',workspaceId:f.workspaceId,runId:run.value.id});
 const prepared=await prepareProcedure(f.context(),run.value.id,{operationKey:'journey-prepare-native-procedure'});
 const stored=await guidedTask(f.context(),prepared.guidedTaskId);expect(stored.state).toBe('active');expect(stored.steps[0]!.state).toBe('pending');
 const verified=await verifyGuidedStep(f.context(),{operationKey:'journey-native-verify',taskId:prepared.guidedTaskId,stepId:stored.steps[0]!.id});
 expect(verified.value.state).toBe('completed');expect(verified.value.receipt).toMatchObject({provider:'orbit',recordState:{schema:'crm.handoff-state/1',kind:'crm.handoff',state:expectedState}});
 const replay=await verifyGuidedStep(f.context(),{operationKey:'journey-native-verify',taskId:prepared.guidedTaskId,stepId:stored.steps[0]!.id});expect(replay.value.receipt).toEqual(verified.value.receipt);
  } finally { vi.unstubAllGlobals(); }
 }
},30000);
