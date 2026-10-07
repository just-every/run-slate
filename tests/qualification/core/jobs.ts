import assert from 'node:assert/strict';
import {consumeJobs} from '../../../src/core/app/background';
export async function jobChecks(env:any,check:any){
 await check(['BASE-OPS-003','BASE-OPS-004'],'queue-replay-and-visible-unsupported-job',async()=>{
 let ack=0,retry=0;const message=(id:string,body:unknown,attempts=1)=>({id,body,attempts,timestamp:new Date(),ack:()=>ack++,retry:()=>retry++});
 for(const attempts of [1,2,3])await consumeJobs({messages:[message('qualification-failed-job',{kind:'unsupported-qualification-job'},attempts)]} as any,env);
 assert.equal(ack,0);assert.equal(retry,3);assert.deepEqual(await env.DB.prepare("SELECT attempts,state,error_code FROM core_job_failures WHERE id='qualification-failed-job'").first(),{attempts:3,state:'failed',error_code:'JOB_DISPATCH_FAILED'});
 await consumeJobs({messages:[message('qualification-health',{kind:'core.health'}),message('qualification-health',{kind:'core.health'})]} as any,env);assert.equal(ack,2);assert.equal((await env.DB.prepare("SELECT count(*) n FROM core_job_failures WHERE id='qualification-health'").first()).n,0);
 });
}
