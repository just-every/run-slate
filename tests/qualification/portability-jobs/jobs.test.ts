import {env} from 'cloudflare:test';
import {beforeEach,test,expect} from 'vitest';
import {fixture,reset} from '../authority/fixture';
import {sessionFor} from '../../e2e/setup/fixtures';
import {createApi} from '../../../src/core/app/hono';
beforeEach(reset);
test('PORT-003 staged export is observable before a separate run',async()=>{
 const f=await fixture(),cookie=await sessionFor(f.owner),app=createApi();
 const response=await app.request('https://slate.example/api/exports/jobs/workspace',{method:'POST',headers:{Cookie:cookie,Origin:'https://slate.example','Content-Type':'application/json'},body:JSON.stringify({operationKey:'qualification-stage'})},env);
 expect(response.status).toBe(202);
 const job=await response.json() as {id:string;state:string};expect(job.state).toBe('queued');
 const status=await app.request('https://slate.example/api/exports/jobs/'+job.id,{headers:{Cookie:cookie}},env);expect(status.status).toBe(200);expect((await status.json() as {state:string}).state).toBe('queued');
});
