import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from '../../container/adapters/d1-workerd.mjs';
import { initializeD1ImportStorage } from '../src/d1/index.ts';
import { importDoorSchema } from '../src/door/index.ts';

test('cancel-only door grants remove only a fresh private plan', async () => {
  const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
  const modules: Array<{type:'ESModule';path:string;contents:string}> = [], seen = new Set<string>();
  async function collect(path: string) {
    if (seen.has(path)) return;
    seen.add(path);
    const source = await readFile(path, 'utf8');
    const contents = path.endsWith('.ts') ? stripTypeScriptTypes(source) : source;
    modules.push({type:'ESModule',path,contents});
    for (const match of contents.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) {
      if (match[1].startsWith('.')) await collect(resolve(dirname(path),match[1]));
    }
  }
  await collect(join(sourceRoot,'door/index.ts'));

  const keys = await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const publicKey = await crypto.subtle.exportKey('jwk',keys.publicKey);
  const origin = 'https://seed.example.test';
  const script = `import { createImportDoorHandler } from './door/index.ts';
export default {async fetch(request,env){
  const handle=createImportDoorHandler({database:env.DB,targets:{},claim:{issuer:'https://business.example.test',installationId:'installation',appOrigin:${JSON.stringify(origin)},expectedEmail:'owner@example.test',publicKeys:{test:${JSON.stringify(publicKey)}}},ownerPrincipalId:'owner',destination:'workspace',format:'json',parse(value){return {kind:'record',sourceId:String(value.id),payload:value}},mapping:{version:'v1',map(){return {effects:[]}}}});
  return await handle(request) ?? Response.json({error:'not_found'},{status:404});
}};`;
  const directory = await mkdtemp(join(tmpdir(),'import-door-cancel-'));
  const mf = new Miniflare({...convertV4MiniflareOptions({modules:[{type:'ESModule',path:join(sourceRoot,'worker.js'),contents:script},...modules],modulesRoot:resolve(sourceRoot,'../..'),compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'imports'}}),resourcePersistencePath:directory});
  try {
    const db = await mf.getD1Database('DB');
    await initializeD1ImportStorage(db);
    await db.batch(importDoorSchema.map(sql=>db.prepare(sql)));
    await db.prepare("INSERT INTO ik_door_settings(installation_id,enabled) VALUES('installation',1)").run();

    const fingerprint='a'.repeat(64), bundle='b'.repeat(64), snapshot='c'.repeat(64);
    async function plan(id:string,options:{job?:'linked'|'unindexed';approval?:boolean}={}) {
      const jobId=options.job?`job-${id}`:null;
      if(jobId)await db.prepare(`INSERT INTO ik_jobs(id,destination,namespace,mapping_version,principal_id,fingerprint,operation_key,plan_json,state,total)
        VALUES(?,'workspace','door:test','v1','owner',?,?,'{}','queued',0)`).bind(jobId,fingerprint,'door:'+id).run();
      await db.prepare(`INSERT INTO ik_door_plans(id,installation_id,namespace,bundle_sha256,fingerprint,previous_id,job_id,snapshot_hash,complete)
        VALUES(?,'installation','test',?,?,NULL,?,?,1)`).bind(id,bundle,fingerprint,options.job==='linked'?jobId:null,snapshot).run();
      await db.prepare("INSERT INTO ik_door_plan_chunks(plan_id,ordinal,body) VALUES(?,0,'{}')").bind(id).run();
      if(options.approval)await db.prepare(`INSERT INTO ik_door_approvals(plan_id,approval_id,owner,approved_at,fingerprint,reviewer)
        VALUES(?,'approval','owner@example.test','2026-10-28T00:00:00.000Z',?,'business')`).bind(id,fingerprint).run();
      await db.prepare("INSERT INTO ik_door_namespaces(installation_id,namespace,pending_id) VALUES('installation','test',?) ON CONFLICT(installation_id,namespace) DO UPDATE SET pending_id=excluded.pending_id").bind(id).run();
    }
    await plan('linked',{job:'linked',approval:true});
    await plan('unindexed',{job:'unindexed'});
    await plan('approved',{approval:true});
    await plan('fresh');

    async function token() {
      const now=Math.floor(Date.now()/1000),payload={v:1,iss:'https://business.example.test',aud:origin,installationId:'installation',email:'owner@example.test',jti:randomUUID(),iat:now,exp:now+300,action:'cancel',namespace:'test',maxBytes:2_000_000,maxChunks:32,maxRecords:1000};
      const header=Buffer.from(JSON.stringify({alg:'ES256',typ:'rer-import-grant+jwt',kid:'test'})).toString('base64url'),body=Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,new TextEncoder().encode(header+'.'+body));
      return `${header}.${body}.${Buffer.from(signature).toString('base64url')}`;
    }
    async function cancel(planId:string) {
      const response=await mf.dispatchFetch(origin+'/api/rer/import/cancel',{method:'POST',headers:{Authorization:'Bearer '+await token(),'Content-Type':'application/json'},body:JSON.stringify({planId})});
      return {status:response.status,body:await response.json() as any};
    }
    for(const id of ['linked','unindexed','approved']) {
      const before={plans:(await db.prepare('SELECT count(*) n FROM ik_door_plans WHERE id=?').bind(id).first<any>()).n,
        jobs:(await db.prepare("SELECT count(*) n FROM ik_jobs WHERE operation_key=?").bind('door:'+id).first<any>()).n,
        approvals:(await db.prepare('SELECT count(*) n FROM ik_door_approvals WHERE plan_id=?').bind(id).first<any>()).n};
      assert.deepEqual(await cancel(id),{status:409,body:{error:'plan_cancel_refused'}},id);
      assert.deepEqual({plans:(await db.prepare('SELECT count(*) n FROM ik_door_plans WHERE id=?').bind(id).first<any>()).n,
        jobs:(await db.prepare("SELECT count(*) n FROM ik_jobs WHERE operation_key=?").bind('door:'+id).first<any>()).n,
        approvals:(await db.prepare('SELECT count(*) n FROM ik_door_approvals WHERE plan_id=?').bind(id).first<any>()).n},before,id);
    }
    assert.deepEqual(await cancel('fresh'),{status:200,body:{planId:'fresh',state:'cancelled'}});
    assert.equal((await db.prepare("SELECT count(*) n FROM ik_door_plans WHERE id='fresh'").first<any>()).n,0);
    assert.equal((await db.prepare("SELECT count(*) n FROM ik_door_plan_chunks WHERE plan_id='fresh'").first<any>()).n,0);
  } finally {
    await mf.dispose();
    await rm(directory,{recursive:true,force:true});
  }
});
