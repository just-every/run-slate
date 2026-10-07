import test from 'node:test';
import assert from 'node:assert/strict';
import {launchRuntime,stop,waitForReady} from '../../e2e/runtime-harness.mjs';
import {safeEnvironment} from './process.mjs';

test('Release e2e runtime owns descendants and releases its actual listener before returning',async()=>{
 const port=56218;
 const server=`require('node:http').createServer((q,r)=>r.end(JSON.stringify({pid:process.pid}))).listen(${port},'127.0.0.1')`;
 const runtime=launchRuntime(process.execPath,['-e',`require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(server)}],{stdio:'inherit'});setInterval(()=>{},1000)`]);
 let descendant;
 try{
  await waitForReady(`http://127.0.0.1:${port}`,runtime);
  descendant=(await(await fetch(`http://127.0.0.1:${port}`)).json()).pid;
  assert.notEqual(descendant,runtime.pid);
  await stop(runtime);await stop(runtime);
  assert.throws(()=>process.kill(descendant,0),{code:'ESRCH'});
  assert.ok(runtime.exitCode!==null||runtime.signalCode!==null);
  await assert.rejects(fetch(`http://127.0.0.1:${port}`));
 }finally{await stop(runtime);}
});

test('Release qualification subprocess retains caller credential-home isolation without provider variables',()=>{
 const env=safeEnvironment();
 for(const key of ['NODE_OPTIONS','XDG_CONFIG_HOME','TMPDIR','PLAYWRIGHT_BROWSERS_PATH'])if(process.env[key])assert.equal(env[key],process.env[key]);
 assert.equal(env.CLOUDFLARE_API_TOKEN,undefined);
 assert.equal(env.OPENAI_API_KEY,undefined);
});
