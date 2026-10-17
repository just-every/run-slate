import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { sqliteRuntime, sqliteTargets } from '../d1/sqlite-runtime.ts';
import { createImportDoorHandler, importDoorSchema, writeImportDoorSettings } from '../../src/door/index.ts';
import { sha256 } from '../../src/provenance/identity.ts';
import type { DoorAction, DoorGrant } from '../../src/door/grants.ts';
import type { Json } from '../../src/types.ts';

export async function door(t: TestContext) {
  const runtime = await sqliteRuntime(t), db = runtime.db();
  await db.batch(importDoorSchema.map(q=>db.prepare(q)));
  const keys = await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const publicKey = await crypto.subtle.exportKey('jwk',keys.publicKey);
  let handler: ReturnType<typeof createImportDoorHandler>;
  const server = createServer(async (req,res)=>{
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const request = new Request(origin+(req.url ?? '/'),{method:req.method,headers:req.headers as Record<string,string>,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
    const response = await handler(request) ?? new Response('Not found',{status:404});
    res.writeHead(response.status,Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise<void>((resolve,reject)=>{server.closeAllConnections();server.close(error=>error?reject(error):resolve());}));
  const address = server.address(); if (!address || typeof address==='string') throw new Error('no_address');
  const origin = `http://127.0.0.1:${address.port}`;
  const options = {database:db,targets:sqliteTargets,claim:{issuer:'https://business.example.test',installationId:'test-installation',appOrigin:origin,expectedEmail:'owner@example.test',publicKeys:{test:publicKey}},
    ownerPrincipalId:'owner',destination:'workspace',format:'json' as const,
    parse(value:Json) {const record=value as {id:string;title:string};return {kind:'document',sourceId:record.id,payload:value};},
    mapping:{version:'v1',map:(record:any)=>record.payload.reject?{effects:[],rejection:'Unsupported source record'}:{effects:[{targetKind:'record',targetId:record.sourceId,value:record.payload}]}},
  };
  handler = createImportDoorHandler(options);
  const ownerPredicate = {sql:"EXISTS(SELECT 1 FROM native_authority WHERE id='owner' AND enabled=1)"};
  const approval = {approvalRecordId:'test-owner-approval',approvedAt:new Date().toISOString()};
  async function token(action:DoorAction,overrides:Partial<DoorGrant>={},privateKey=keys.privateKey) {
    const now=Math.floor(Date.now()/1000);
    const payload:DoorGrant={v:1,iss:options.claim.issuer,aud:origin,installationId:options.claim.installationId,email:options.claim.expectedEmail,jti:randomUUID(),iat:now,exp:now+300,action,namespace:'knowledge',maxBytes:2_000_000,maxChunks:32,maxRecords:1000,...overrides};
    const header=Buffer.from(JSON.stringify({alg:'ES256',typ:'rer-import-grant+jwt',kid:'test'})).toString('base64url'),body=Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,new TextEncoder().encode(header+'.'+body));
    return header+'.'+body+'.'+Buffer.from(signature).toString('base64url');
  }
  async function call(action:DoorAction,body:unknown,overrides:Partial<DoorGrant>={},signed?:string) {
    const response=await fetch(origin+'/api/rer/import/'+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(signed ?? await token(action,overrides))},body:JSON.stringify(body)});
    return {status:response.status,body:await response.json() as any};
  }
  async function upload(records:unknown[],overrides:Partial<DoorGrant>={}) {
    const bytes=Buffer.from(JSON.stringify(records)),totalChunks=Math.ceil(bytes.length/65_536),hash=sha256(bytes);
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
  async function plan(records:unknown[],extra:Record<string,unknown>={},overrides:Partial<DoorGrant>={}) {
    const uploadId=await upload(records),result=await call('plan',{uploadId,...extra},overrides);
    return result;
  }
  async function apply(plan:any,overrides:Partial<DoorGrant>={}) {
    let result;
    do {result=await call('apply',{planId:plan.planId,reviewedFingerprint:plan.fingerprint},{fingerprint:plan.fingerprint,...approval,...overrides});assert.equal(result.status,200,JSON.stringify(result.body));} while(result.body.job.state!=='completed');
    return result.body.job;
  }
  async function undo(planId:string) {
    let result;
    do {result=await call('undo',{planId});assert.equal(result.status,200,JSON.stringify(result.body));} while(!['undone','rolled_back'].includes(result.body.job.state));
    return result;
  }
  return {runtime,db,options,ownerPredicate,approval,call,token,upload,plan,apply,undo,
    enable:()=>writeImportDoorSettings(db,options.claim.installationId,{enabled:true},ownerPredicate)};
}
export const documents = (count:number,large=false) => Array.from({length:count},(_,i)=>({id:String(i),title:`Knowledge article ${i}`,body:large?'Reviewed historical knowledge. '.repeat(55):'Historical knowledge.'}));
