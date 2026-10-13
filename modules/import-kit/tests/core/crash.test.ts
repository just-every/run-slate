import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setup } from './fixtures.ts';
import { resumeImport, readImportJob } from '../../src/engine/index.ts';
import { readPersistedImport } from '../../src/storage/sqlite.ts';
async function killAtWrite(path:string,mode:string,id=''):Promise<string> {
  const child=spawn(process.execPath,[fileURLToPath(new URL('./crash-child.ts',import.meta.url)),path,mode,id,String(Date.now())],{stdio:['ignore','pipe','pipe']});
  let output='',stderr='';const timer=setTimeout(()=>child.kill('SIGKILL'),10000);child.stderr.on('data',data=>stderr+=data);
  child.stdout.on('data',data=>{output+=data;if(output.includes('KILL_NOW'))child.kill('SIGKILL');});
  const result=await new Promise<{code:number|null;signal:string|null}>(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));clearTimeout(timer);
  assert.equal(result.signal,'SIGKILL',stderr);assert.match(output,/KILL_NOW/);return /JOB ([^\n]+)/.exec(output)?.[1]??id;
}
function resumeFresh(path:string,id:string) {const result=spawnSync(process.execPath,[fileURLToPath(new URL('./crash-child.ts',import.meta.url)),path,'resume',id,String(Date.now())],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);}
function expire(t:any,ctx:any,id:string){const row=ctx.storage.database.prepare('SELECT lease_expires FROM ik_jobs WHERE id=?').get(id);t.mock.timers.setTime(row.lease_expires);}
test('actual SIGKILL during apply and undo preserves only committed batches; resume cleans abandoned originals',async t=>{
  // Only lease time is frozen; the child still writes real SQLite and dies by SIGKILL.
  t.mock.timers.enable({apis:['Date'],now:1700000000000});
  const {ctx,path}=setup(t),id=await killAtWrite(path,'apply');const job=readImportJob(id,ctx);assert.equal(job.state,'applying');assert.equal(job.checkpoint,1);
  const partial=readPersistedImport(ctx);assert.equal(partial.rows.length,1);assert.equal(partial.provenance.length,1);assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_stages').get().n,1);
  assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_sources').get().n,1);
  await assert.rejects(resumeImport(id,ctx),/LEASE_BUSY/);expire(t,ctx,id);const complete=resumeFresh(path,id);assert.equal(complete.state,'completed');assert.equal(complete.fence,2);
  const completed=readPersistedImport(ctx);
  assert.equal(completed.rows.length,4);
  assert.deepEqual(completed.rows.map(({targetId,value})=>({targetId,value})),Array.from({length:4},(_,index)=>({targetId:String(index),value:{text:'row '+index,index}})));
  assert.equal(completed.provenance.length,4);
  assert.equal(new Set(completed.provenance.map(row=>row.sourceIdentity)).size,4);
  assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_sources').get().n,4);
  assert.equal(ctx.storage.database.prepare('SELECT count(DISTINCT identity) n FROM ik_sources').get().n,4);
  assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_batches').get().n,4);
  assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_stages').get().n,0);
  await killAtWrite(path,'undo',id);assert.equal(readImportJob(id,ctx).state,'undoing');assert.equal(readPersistedImport(ctx).rows.length,3);
  expire(t,ctx,id);assert.equal(resumeFresh(path,id).state,'undone');
  const undone=readPersistedImport(ctx);
  assert.equal(undone.rows.length,0);
  assert.deepEqual(undone.rows,[]);assert.deepEqual(undone.provenance,[]);
  assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_sources').get().n,0);
  assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_provenance WHERE reversed=0').get().n,0);
  assert.equal(ctx.storage.database.prepare('SELECT count(*) n FROM ik_provenance WHERE reversed=1').get().n,4);
});
