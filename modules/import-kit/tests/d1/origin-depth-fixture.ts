import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from '../../../container/adapters/d1-workerd.mjs';
import { initializeD1ImportStorage } from '../../src/d1/index.ts';
import type { D1Database, D1ImportContext } from '../../src/d1/index.ts';
import { targets } from './fixtures.ts';

/** Measures real D1 calls and checks every statement in complete batch transport. */
function meter(current:()=>D1Database) {
  const raw=new WeakMap<object,any>(),queries=new WeakMap<object,{sql:string;params:any[]}>();
  let count=0,maxSql=0,maxValue=0,maxBindings=0,maxWire=0;
  const requests:{label:string;queries:number}[]=[];
  const check=(sql:string,params:any[])=>{
    const bytes=params.map(value=>typeof value==='string'?Buffer.byteLength(value):value instanceof ArrayBuffer||ArrayBuffer.isView(value)?value.byteLength:8);
    maxSql=Math.max(maxSql,Buffer.byteLength(sql));maxBindings=Math.max(maxBindings,params.length);maxValue=Math.max(maxValue,0,...bytes);
    assert.ok(Buffer.byteLength(sql)<=100_000);assert.ok(params.length<=100);
    assert.ok(bytes.every(size=>size<=2_000_000));assert.ok(bytes.reduce((sum,size)=>sum+size,0)<=2_000_000);
  };
  const wrap=(sql:string,params:any[]=[]):any=>{
    const statement=current().prepare(sql).bind(...params);
    const result={bind:(...values:any[])=>wrap(sql,values),async first(){check(sql,params);count++;return statement.first();},async all(){check(sql,params);count++;return statement.all();}};
    raw.set(result,statement);queries.set(result,{sql,params});return result;
  };
  const database:D1Database={prepare:wrap,async batch(statements){
    const batch=statements.map(statement=>{const query=queries.get(statement)!;assert.ok(query);check(query.sql,query.params);return query;});
    count++;const bytes=Buffer.byteLength(JSON.stringify(batch));maxWire=Math.max(maxWire,bytes);assert.ok(bytes<=2*1024*1024);
    return current().batch(statements.map(statement=>raw.get(statement)));
  }};
  return {database,async request<T>(label:string,run:()=>Promise<T>):Promise<T>{count=0;try{return await run();}finally{requests.push({label,queries:count});assert.ok(count<=1000,`${label}: ${count} queries`);}},summary:()=>({requests,maxSql,maxValue,maxBindings,maxWire})};
}

export async function originDepthFixture(t:any) {
  const directory=await mkdtemp(join(tmpdir(),'import-origin-depth-'));
  const init=()=>new Miniflare({...convertV4MiniflareOptions({modules:true,script:'export default { fetch(){return new Response("ok")} }',compatibilityDate:'2026-09-01',d1Databases:{DB:'imports'}}),resourcePersistencePath:join(directory,'state')});
  let mf=init(),db:any;
  // Register before either runtime acquisition or initialization can fail.
  t.after(async()=>{
    try {
      await mf.dispose();
      if(process.env.IMPORT_KIT_TEST_EVIDENCE_DIR){
        const allowed=await realpath(resolve(tmpdir(),'..','evidence')),out=await realpath(process.env.IMPORT_KIT_TEST_EVIDENCE_DIR),path=relative(allowed,out);
        assert.ok(path&&!path.startsWith('..'+sep)&&path!=='..'&&!path.startsWith(sep));
        const witness=await mkdtemp(join(out,'origin-depth-'));await cp(directory,witness,{recursive:true});
        await writeFile(join(witness,'transport.json'),JSON.stringify(measured.summary(),null,2)+'\n');
      }
    } finally { await rm(directory,{recursive:true,force:true}); }
  });
  const measured=meter(()=>db);
  db=await mf.getD1Database('DB');
  if(process.env.IMPORT_KIT_TEST_EVIDENCE_DIR)await mkdir(process.env.IMPORT_KIT_TEST_EVIDENCE_DIR,{recursive:true});
  await measured.request('initialize-first',()=>initializeD1ImportStorage(measured.database));
  await measured.request('initialize-second',()=>initializeD1ImportStorage(measured.database));
  await db.batch(['CREATE TABLE contacts(destination TEXT,kind TEXT,id TEXT PRIMARY KEY,revision TEXT,email TEXT)','CREATE TABLE evidence(id TEXT PRIMARY KEY,detail TEXT)','CREATE TABLE sessions(id TEXT PRIMARY KEY,actor TEXT,enabled INTEGER,expires INTEGER)',"INSERT INTO sessions VALUES('session','owner',1,9999999999999)"].map(query=>db.prepare(query)));
  const context=():D1ImportContext=>({destination:'workspace',namespace:'archive',mappingVersion:'v1',batchSize:100,maxBatches:1,maxBatchBytes:2*1024*1024,storage:{database:measured.database,targets},authorization:{principalId:'owner',predicate:()=>({sql:"EXISTS(SELECT 1 FROM sessions WHERE id=? AND actor=? AND enabled=1 AND expires>unixepoch()*1000)",params:['session','owner']})}});
  return {context,db:()=>db,request:measured.request,summary:measured.summary,async reopen(){await mf.dispose();mf=init();db=await mf.getD1Database('DB');}};
}
