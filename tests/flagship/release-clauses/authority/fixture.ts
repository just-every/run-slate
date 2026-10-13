import {env} from 'cloudflare:test';
import {vi,expect} from 'vitest';
import {fixture} from '../../../qualification/inquiry/fixture';
import {createApi} from '../../../../src/core/app/hono';
import {sessionFor} from '../../../e2e/setup/fixtures';
import {connect} from '../../../../src/core/features/connectors/service';
import {publishPublicPage} from '../../../../src/core/features/publishing/service';
import {getEffectAdapter} from '../../../../src/core/features/connectors/effects';
import {issueGrant} from '../../../../src/core/features/effects/grants';
import {startRun} from '../../../../src/core/features/runs/service';
import {requestHash} from '../../../../src/core/app/operations';
import type {AppBindings} from '../../../../src/core/app/types';
export {fixture};
export const secret='release-test-only-secret-at-least-thirty-two-bytes';
export async function transport(f:Awaited<ReturnType<typeof fixture>>){
 const api=createApi(),cookie=await sessionFor(f.owner),bindings={...env,AI_API_KEY:'test-only',CONNECTOR_CREDENTIALS_KEY:secret} as AppBindings;
 async function request(path:string,input?:unknown,token?:string){const response=await api.request('https://local.test'+path,{method:input===undefined?'GET':'POST',headers:{origin:'https://local.test','content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{cookie})},...(input===undefined?{}:{body:JSON.stringify(input)})},bindings);return {status:response.status,body:await response.json<any>()};}
 async function mcp(token:string,name:string,args:unknown){const r=await request('/api/agent/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},token);return {...r,value:r.body.result?.content?.[0]?JSON.parse(r.body.result.content[0].text):r.body};}
 return {request,mcp};
}
export function refuseNetwork(){const calls:string[]=[];vi.stubGlobal('fetch',async(input:string|URL|Request)=>{const url=String(input instanceof Request?input.url:input);calls.push(url);throw new Error('Unmatched authority test transport: '+url);});return calls;}
export async function effectFixture(kind:'answer'|'procedure'='answer'){
 const f=await fixture(),context=()=>({...f.context(),sourceSecret:secret});
 const requests:string[]=[],sends:string[]=[];
 const issue={id:99,number:1,title:'Before',body:'Unchanged target',state:'open',updated_at:'2026-09-01T00:00:00Z',html_url:'https://github.com/just-every/run-slate/issues/1'};
 vi.stubGlobal('fetch',async(input:string|URL|Request,init?:RequestInit)=>{const url=new URL(input instanceof Request?input.url:String(input)),method=init?.method??'GET';requests.push(method+' '+url);if(url.origin==='https://api.github.com'&&url.pathname==='/user'&&method==='GET')return Response.json({id:7,login:'fixture-owner'});if(url.origin==='https://api.github.com'&&url.pathname==='/repos/just-every/run-slate/issues/1'&&method==='GET')return Response.json(issue);if(method!=='GET')sends.push(method+' '+url);throw new Error('Unmatched authority test transport: '+method+' '+url);});
 const conn=await connect(context(),{operationKey:'custody-connection',provider:'github',token:'test-only-token',accountId:'fixture-owner'},secret);
 await publishPublicPage(context(),f.page.pageId,{operationKey:'custody-public-source',expectedRevisionId:f.page.revisionId,host:'test.invalid',slug:f.page.pageId});
 const run=await startRun(context(),{...f.ask,kind},{apiKey:'test-only'});
 const stored=await env.DB.prepare('SELECT * FROM intelligence_runs WHERE id=?').bind(run.value.id).first<any>();
 expect(stored).toMatchObject({kind,status:'queued',model:'measured-test-frontier'});
 expect(JSON.parse(stored.input_json).route.evaluationId).toBe(f.routes.find(r=>r.tasks[0]===kind)!.evaluationId);
 const expectedRevision=(await(await getEffectAdapter(context(),conn.value.id,secret)).read('just-every/run-slate/1')).revision,content={body:'Proposed update'};
 const grant=await issueGrant(context(),{operationKey:'custody-grant',subjectId:f.owner,kind:'effect',expiresAt:'2099-01-01T00:00:00.000Z',scope:{operations:['github.issue.update'],targets:['just-every/run-slate/1'],accounts:['fixture-owner'],sourceIds:[f.page.pageId],audience:[f.owner,f.reader,'public'],maxCostMicros:0,contentHash:await requestHash(content),conditions:{expectedRevision},acceptNonAtomicProvider:true}});
 const input={operationKey:'custody-intent',runId:run.value.id,grantId:grant.value.id,connectionId:conn.value.id,operation:'github.issue.update' as const,accountId:'fixture-owner',target:'just-every/run-slate/1',expectedRevision,content,costMicros:0 as const};
 return {...f,context,run,grant,input,requests,sends,issue,...await transport(f)};
}
export async function effects(workspaceId:string){return (await env.DB.prepare('SELECT * FROM intelligence_effects WHERE workspace_id=? ORDER BY id').bind(workspaceId).all()).results;}
export async function receipts(workspaceId:string){return (await env.DB.prepare('SELECT * FROM operation_receipts WHERE workspace_id=? ORDER BY id').bind(workspaceId).all()).results;}
