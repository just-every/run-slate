import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

test('cross fixture handoff stops descendants, restarts the same configuration, and closes once',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'slate-cross-lifetime-'));
 process.env.CROSS_EVIDENCE_DIR=directory;
 const {start,stop,close,environment}=await import('../../flagship/cross/runtime.mjs');
 const port=Number(process.env.CROSS_LIFETIME_PORT??8768),identity=randomUUID(),origin='http://127.0.0.1:'+port;
 const server="require('node:http').createServer((req,res)=>res.end(JSON.stringify({pid:process.pid,identity:"+JSON.stringify(identity)+"}))).listen("+port+",'127.0.0.1')";
 const args=['-e',`require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(server)}],{stdio:'inherit'});setInterval(()=>{},1000)`];
 try{
  const first=await start(directory,args,'first',origin,environment);
  const response=await(await fetch(origin+'/health')).json(),descendant=response.pid;
  assert.equal(response.identity,identity);assert.equal(typeof descendant,'number');assert.ok(Number.isInteger(descendant)&&descendant>0);
  await assert.rejects(start(directory,args,'collision',origin,environment),/Runtime origin is unavailable/);
  await stop(first);await stop(first);
  assert.throws(()=>process.kill(descendant,0),{code:'ESRCH'});
  assert.ok(first.exitCode!==null||first.signalCode!==null);
  const second=await start(directory,args,'second',origin,environment);
  assert.notEqual((await(await fetch(origin+'/health')).json()).pid,descendant);
  await close();await close();
  assert.ok(second.exitCode!==null||second.signalCode!==null);
 }finally{await close();await rm(directory,{recursive:true,force:true});}
});
