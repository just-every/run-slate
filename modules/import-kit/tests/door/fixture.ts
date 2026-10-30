import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { sqliteRuntime, sqliteTargets } from '../d1/sqlite-runtime.ts';
import { createImportDoorHandler, importDoorSchema, writeImportDoorSettings } from '../../src/door/index.ts';
import { sha256 } from '../../src/provenance/identity.ts';
import type { DoorAction, DoorGrant } from '../../src/door/grants.ts';
import type { Json } from '../../src/types.ts';
import type { D1Database, D1TargetAdapter } from '../../src/d1/types.ts';
import { doorTransport } from './transport.ts';
import { finishJob } from './progress.ts';

export async function door(t: TestContext, mode: 'grant' | 'operator' = 'grant') {
  let origin = '';
  const transport = doorTransport(() => origin), handlersRunning = new Set<Promise<void>>();
  // Registered before the database cleanup: drain HTTP work before closing SQLite.
  t.after(async () => {
    await transport.close();
    const closed = new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    server.closeAllConnections();
    await closed;
    await Promise.allSettled([...handlersRunning]);
  });
  const runtime = await sqliteRuntime(t), db = runtime.db();
  await db.batch(importDoorSchema.map(q=>db.prepare(q)));
  // Test-side counter of every statement the door executes, batch members included,
  // and of the bytes their results carry back.
  let statements = 0, queries = 0, bytes = 0;
  const requests: {action:string;status:number;queries:number;statements:number;bytes:number}[] = [];
  const read = <T,>(result:T):T => { bytes += Buffer.byteLength(JSON.stringify(result) ?? ''); return result; };
  const counted = (s:any):any => ({query:s.query,values:s.values,bind:(...v:any[])=>counted(s.bind(...v)),first:async()=>{queries++;statements++;return read(await s.first());},all:async()=>{queries++;statements++;return read(await s.all());}});
  const database: D1Database = {prepare:query=>counted(db.prepare(query)),batch:async members=>{queries++;statements+=members.length;return read(await db.batch(members));}};
  const keys = await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const publicKey = await crypto.subtle.exportKey('jwk',keys.publicKey);
  type Handler = (request: Request) => Promise<Response | null>;
  let handlers: Handler[] = [];
  const server = createServer((req,res)=>{
    const controller = new AbortController();
    const disconnect = () => controller.abort(new Error('door_client_closed'));
    res.once('close',disconnect);
    const handling = (async () => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const request = new Request(origin+(req.url ?? '/'),{method:req.method,headers:req.headers as Record<string,string>,signal:controller.signal,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
    statements = 0; queries = 0; bytes = 0;
    let response: Response | null = null;
    for (const handler of handlers) if ((response = await handler(request))) break;
    if (response) requests.push({action:new URL(request.url).pathname.split('/').pop()!,status:response.status,queries,statements,bytes});
    response ??= new Response('Not found',{status:404});
    res.writeHead(response.status,Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
    })().catch(error=>{res.destroy(error);}).finally(()=>{res.removeListener('close',disconnect);handlersRunning.delete(handling);});
    handlersRunning.add(handling);
  });
  // The kit's node:sqlite work in this same process can run for minutes without
  // yielding to the event loop; a keep-alive timeout that then fires late resets
  // the next request on a reused connection. Idle connections stay open instead.
  server.keepAliveTimeout = 0;
  const ready = once(server,'listening');
  server.listen(0,'127.0.0.1');
  await ready;
  const address = server.address(); if (!address || typeof address==='string') throw new Error('no_address');
  origin = `http://127.0.0.1:${address.port}`;
  const options = {database,targets:{...sqliteTargets,preparePreservedUndo:undefined} as D1TargetAdapter,claim:{issuer:'https://business.example.test',installationId:'test-installation',appOrigin:origin,expectedEmail:'owner@example.test',publicKeys:{test:publicKey}},
    ownerPrincipalId:'owner',destination:'workspace',format:'json' as const,
    parse(value:Json) {const record=value as {id:string;title:string};return {kind:'document',sourceId:record.id,payload:value};},
    mapping:{version:'v1',map:(record:any)=>record.payload.reject?{effects:[],rejection:'Unsupported source record'}:{effects:[{targetKind:'record',targetId:record.sourceId,value:record.payload}]}},
  };
  const ownerPredicate = {sql:"EXISTS(SELECT 1 FROM native_authority WHERE id='owner' AND enabled=1)"};
  const approval = {approvalRecordId:'test-owner-approval',approvedAt:new Date().toISOString()};
  const state = {via:mode,claimInstallationId:options.claim.installationId,headers:{} as Record<string,string>};
  const {claim,...runtimeOptions} = options;
  let operator: (overrides?: Record<string, unknown>) => Handler = () => { throw new Error('operator_mode_only'); };
  if (mode === 'operator') {
    // An independently copied seed has NO sibling owner-claim or operator-auth.
    const copy = await mkdtemp(join(tmpdir(),'door-without-claim-'));
    t.after(()=>rm(copy,{recursive:true,force:true}));
    await cp(new URL('../../src',import.meta.url),join(copy,'import-kit/src'),{recursive:true});
    await cp(new URL('../../../d1-transport',import.meta.url),join(copy,'d1-transport'),{recursive:true});
    // The guide's operator-only source inventory excludes optional grant code.
    for (const file of ['index.ts','admission.ts','grants.ts']) await rm(join(copy,'import-kit/src/door',file));
    const {createImportOperatorHandler} = await import(pathToFileURL(join(copy,'import-kit/src/door/operator.ts')).href);
    operator = (overrides = {}) => createImportOperatorHandler({...runtimeOptions,installationId:claim.installationId,
      appOrigin:origin,ownerEmail:claim.expectedEmail,namespace:'knowledge',
      authorize:async (request:Request)=>request.headers.get('Cookie')==='test-owner-session' ? ownerPredicate : null,...overrides});
    handlers = [operator()];
    await writeImportDoorSettings(db,claim.installationId,{enabled:false},ownerPredicate);
  } else handlers = [createImportDoorHandler(options)];
  /** Add Business later: a grant mount for RER's claim installation id, keyed to the existing door. */
  function addGrants(claimInstallationId: string) {
    handlers = [createImportDoorHandler({...options,claim:{...claim,installationId:claimInstallationId},installationId:claim.installationId}),...handlers];
    state.claimInstallationId = claimInstallationId; state.via = 'grant';
  }

  /** RER's signer at the network edge: any payload, ES256 under the test key ring. */
  async function sign(payload:Record<string,unknown>,privateKey=keys.privateKey) {
    const header=Buffer.from(JSON.stringify({alg:'ES256',typ:'rer-import-grant+jwt',kid:'test'})).toString('base64url'),body=Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,new TextEncoder().encode(header+'.'+body));
    return header+'.'+body+'.'+Buffer.from(signature).toString('base64url');
  }
  async function token(action:DoorAction,overrides:Partial<DoorGrant>={},privateKey=keys.privateKey) {
    const now=Math.floor(Date.now()/1000);
    const payload:DoorGrant={v:1,iss:options.claim.issuer,aud:origin,installationId:state.claimInstallationId,email:options.claim.expectedEmail,jti:randomUUID(),iat:now,exp:now+300,action,namespace:'knowledge',maxBytes:2_000_000,maxChunks:32,maxRecords:1000,...overrides};
    return sign(payload as unknown as Record<string,unknown>,privateKey);
  }
  async function call(action:DoorAction,body:unknown,overrides:Partial<DoorGrant>={},signed?:string) {
    const response=await transport.request(origin+(state.via==='operator'?'/api/operator/import/':'/api/rer/import/')+action,{method:'POST',headers:{'Content-Type':'application/json',...state.headers,...(state.via==='operator'?{Origin:origin,Cookie:'test-owner-session'}:{Authorization:'Bearer '+(signed ?? await token(action,overrides))})},body:JSON.stringify(body)});
    return {status:response.status,body:await response.json() as any};
  }
  /** Records upload as one JSON array; a Buffer uploads as given. */
  async function upload(records:unknown[]|Buffer,overrides:Partial<DoorGrant>={}) {
    const bytes=Buffer.isBuffer(records)?records:Buffer.from(JSON.stringify(records)),totalChunks=Math.ceil(bytes.length/65_536),hash=sha256(bytes);
    let uploadId:string|undefined;
    // Reverse chunk order proves resumable, out-of-order admission.
    for(let index=totalChunks-1;index>=0;index--) {
      const chunk=bytes.subarray(index*65_536,Math.min((index+1)*65_536,bytes.length));
      const result=await call('uploads',{...(uploadId?{uploadId}:{}),name:'knowledge.json',bundleSha256:hash,totalBytes:bytes.length,totalChunks,index,chunkSha256:sha256(chunk),base64:chunk.toString('base64')},overrides);
      assert.equal(result.status,200,JSON.stringify(result.body));uploadId=result.body.uploadId;
      if(index>0) { const resumed=await call('uploads',{uploadId},overrides);assert.equal(resumed.body.received.length,totalChunks-index); }
      else assert.equal(result.body.complete,true);
    }
    return uploadId!;
  }
  async function plan(records:unknown[]|Buffer,extra:Record<string,unknown>={},overrides:Partial<DoorGrant>={}) {
    const uploadId=await upload(records),result=await call('plan',{uploadId,...extra},overrides);
    return result;
  }
  async function apply(plan:any,overrides:Partial<DoorGrant>={}) {
    const result = await finishJob('apply',plan.planId,()=>call('apply',{planId:plan.planId,reviewedFingerprint:plan.fingerprint},{fingerprint:plan.fingerprint,...approval,...overrides}));
    return result.body.job;
  }
  async function undo(planId:string) {
    return finishJob('undo',planId,()=>call('undo',{planId}),async jobId=>{
      const row=await db.prepare('SELECT COUNT(*) n FROM ik_provenance WHERE job_id=?').bind(jobId).first<{n:number}>();
      return row!.n;
    });
  }
  return {origin,request:transport.request,runtime,db,options,requests,ownerPredicate,approval,call,sign,token,upload,plan,apply,undo,state,operator,addGrants,
    mount:(...next:Handler[])=>{handlers=next;},
    enable:()=>writeImportDoorSettings(db,options.claim.installationId,{enabled:true},ownerPredicate)};
}
export const documents = (count:number,large=false) => Array.from({length:count},(_,i)=>({id:String(i),title:`Knowledge article ${i}`,body:large?'Reviewed historical knowledge. '.repeat(55):'Historical knowledge.'}));
