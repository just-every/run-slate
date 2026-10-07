import {env} from 'cloudflare:test';
import {test,expect,vi,afterEach} from 'vitest';
import {fixture,answer,providerResponse} from '../inquiry/fixture';
import {startRun} from '../../../src/core/features/runs/service';
import {consumeIntelligenceJob} from '../../../src/core/features/runs/worker';
import type {AppBindings} from '../../../src/core/app/types';
afterEach(()=>vi.unstubAllGlobals());
test('FLAG-003 every failed and successful provider attempt retains separate time and accounting evidence',async()=>{
 const f=await fixture(),run=await startRun(f.context(),{...f.ask,operationKey:'instrumented-attempts'},{apiKey:'TEST-ONLY-NO-SEND'});const observed:{startedAt:string;endedAt:string;status:number}[]=[];
 vi.stubGlobal('fetch',async()=>{const startedAt=new Date().toISOString(),status=observed.length<2?503:200;observed.push({startedAt,endedAt:new Date().toISOString(),status});return status===503?new Response('controlled transient provider test double',{status}):providerResponse(answer);});
 for(let attempt=0;attempt<3;attempt++){await env.DB.prepare('UPDATE intelligence_runs SET next_at=NULL WHERE id=?').bind(run.value.id).run();await consumeIntelligenceJob({...env,AI_API_KEY:'TEST-ONLY-NO-SEND'} as AppBindings,{kind:'intelligence.run',workspaceId:f.workspaceId,runId:run.value.id});}
 const stored=await env.DB.prepare('SELECT status,attempts,cost_micros,tokens,uncertain_cost_micros FROM intelligence_runs WHERE id=?').bind(run.value.id).first();expect(stored).toMatchObject({status:'completed',attempts:3,cost_micros:20,tokens:20});expect(Number(stored!.uncertain_cost_micros)).toBeGreaterThan(0);
 const stages=(await env.DB.prepare("SELECT state,started_at,completed_at,result_json FROM intelligence_stages WHERE run_id=? AND stage='generation' ORDER BY started_at,id").bind(run.value.id).all()).results;
 console.info('ATTEMPT_ACCOUNTING',JSON.stringify({observed,stored,stages,limits:'Controlled provider transport, no inference/quality/human-attention claim.'}));
 expect(stages,'Every attempted generation, including both failures, needs durable timing/accounting evidence').toHaveLength(3);
 expect(stages.filter(s=>s.state==='failed')).toHaveLength(2);for(const stage of stages){expect(Number.isFinite(Date.parse(String(stage.started_at)))).toBe(true);expect(Number.isFinite(Date.parse(String(stage.completed_at)))).toBe(true);}
});
