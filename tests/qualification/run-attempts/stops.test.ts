beforeEach(resetDeployment);
import {resetDeployment} from '../../e2e/setup/reset-deployment';
import {env} from 'cloudflare:test';
import {test,expect,vi,afterEach,beforeEach} from 'vitest';
import {fixture,answer,providerResponse} from '../inquiry/fixture';
import {startRun,controlRun} from '../../../src/core/features/runs/service';
import {consumeIntelligenceJob,scheduleIntelligence} from '../../../src/core/features/runs/worker';
import {runView} from '../../../src/core/features/runs/view';
import {accountAttempt} from '../../../src/core/features/runs/attempts';
import type {AppBindings} from '../../../src/core/app/types';
afterEach(()=>vi.unstubAllGlobals());
import {bindings,start,accounting,deferred,finishStopped} from './fixture';
test("owning inquiry, trial, skill and source stops atomically reconcile outstanding generation",async()=>{
 for(const run of [
  // Original case: inquiry stop atomically reconciles outstanding generation
  async()=>{const f=await fixture();const {createInquiry}=await import('../../../src/core/features/inquiries/service');const {stopInquiry}=await import('../../../src/core/features/inquiries/control');const q=await createInquiry(f.context(),{operationKey:'attempt-inquiry',pageId:f.page.pageId,question:'Test stop',refs:f.refs,audience:f.ask.audience,hypotheses:[{statement:'A',disconfirmation:'B'},{statement:'B',disconfirmation:'A'}]});const run=await startRun(f.context(),f.ask,{apiKey:'TEST-ONLY-NO-SEND'},undefined,undefined,q.value.id),d=deferred();const pending=consumeIntelligenceJob(bindings(),{kind:'intelligence.run',workspaceId:f.workspaceId,runId:run.value.id});await d.ready;await stopInquiry(f.context(),q.value.id,{operationKey:'stop-attempt-inquiry',expectedRevisionId:q.value.revisionId,reason:'test stop'});await finishStopped(run.value.id,d,pending,'cancelled');
  },
  // Original case: trial stop atomically reconciles outstanding generation
  async()=>{const {trialFixture}=await import('../inquiry/trial-fixture');const f=await trialFixture([1,2,3,4]);const {stopTrial}=await import('../../../src/core/features/experiments/control');const run=await startRun(f.context(),f.ask,{apiKey:'TEST-ONLY-NO-SEND'});await env.DB.prepare("UPDATE intelligence_runs SET input_json=json_set(input_json,'$.trialId',?) WHERE id=?").bind(f.trialId,run.value.id).run();const d=deferred();const pending=consumeIntelligenceJob(bindings(),{kind:'intelligence.run',workspaceId:f.workspaceId,runId:run.value.id});await d.ready;await stopTrial(f.context(),{id:f.trialId,operationKey:'stop-attempt-trial',expectedRevisionId:f.active.value.revisionId,reason:'test stop'});await finishStopped(run.value.id,d,pending,'cancelled');
  },
  // Original case: skill retirement atomically reconciles outstanding generation
  async()=>{const f=await fixture();const {createSkill,transitionSkill}=await import('../../../src/core/features/skills/service');const {passingEvaluation}=await import('../authority/fixture');const skill=await createSkill(f.context(),{operationKey:'attempt-skill-draft',pageId:f.page.pageId,name:'Test method',definition:{instructions:'Test only',refs:f.refs,audience:f.ask.audience,tools:['read-evidence'],effects:[],preconditions:[],successTests:['test'],escalations:[],maxCostMicros:1000000}});await passingEvaluation(f.context(),skill.value.revisionId);await transitionSkill(f.context(),{operationKey:'attempt-skill-active',revisionId:skill.value.revisionId,action:'activate'});const run=await startRun(f.context(),{...f.ask,skillRevisionId:skill.value.revisionId},{apiKey:'TEST-ONLY-NO-SEND'}),d=deferred();const pending=consumeIntelligenceJob(bindings(),{kind:'intelligence.run',workspaceId:f.workspaceId,runId:run.value.id});await d.ready;await transitionSkill(f.context(),{operationKey:'attempt-skill-retire',revisionId:skill.value.revisionId,action:'retire'});await finishStopped(run.value.id,d,pending,'paused');
  },
  // Original case: source disconnect atomically reconciles outstanding generation
  async()=>{const f=await fixture(),secret='test-only-credential-key-1234567890123456',ctx=()=>({...f.context(),sourceSecret:secret});const {connect,disconnect}=await import('../../../src/core/features/connectors/service');const {addSource,refreshSource}=await import('../../../src/core/features/source-memory/service');vi.stubGlobal('fetch',async(input:Request|string|URL)=>Response.json(String(input).endsWith('/user')?{id:7,login:'reader'}:{title:'Owning source',body:'Permitted source evidence',updated_at:'v1',state:'open',number:1}));const connection=await connect(ctx(),{operationKey:'attempt-connect',provider:'github',accountId:'reader',token:'test-only-token'},secret);const source=await addSource(ctx(),{operationKey:'attempt-source',connectionId:connection.value.id,remoteId:'acme/project/1'});const revision=await refreshSource(ctx(),source.value.id,secret);const refs=[...f.refs,{kind:'source' as const,sourceId:source.value.id,revisionId:revision.sourceRevisionId}];const run=await startRun(ctx(),{...f.ask,refs,audience:[f.owner]},{apiKey:'TEST-ONLY-NO-SEND'}),d=deferred(true);const pending=consumeIntelligenceJob({...bindings(),CONNECTOR_CREDENTIALS_KEY:secret},{kind:'intelligence.run',workspaceId:f.workspaceId,runId:run.value.id});await d.ready;await disconnect(ctx(),{id:connection.value.id,operationKey:'attempt-disconnect',expectedRevisionId:connection.receipt.revisionId!});await finishStopped(run.value.id,d,pending,'paused');
  }
 ]){
  await resetDeployment();
  try{await run();}finally{vi.unstubAllGlobals();}
 }
});
