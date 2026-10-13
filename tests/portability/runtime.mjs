import {testDevKey,devKeyHeaders} from '../e2e/dev-key.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {availablePort,waitForReady,sessionCookie} from '../e2e/runtime-harness.mjs';
import {command,launch,stop,safeEnvironment} from '../qualification/local/process.mjs';

export const ownerEmail='archive-owner@example.invalid';
export const root=path.resolve(import.meta.dirname,'../..');

/** Separate real D1/R2 bindings; all configuration and state stay in caller scratch. */
export async function runtime(directory){
  const port=await availablePort(),inspector=await availablePort();
  const origin=`http://127.0.0.1:${port}`,persist=path.join(directory,'state');
  const emitted=JSON.parse(await readFile(path.join(root,'dist/server/wrangler.json'),'utf8'));
  const configPath=path.join(directory,'wrangler.json');
  const config={...emitted,main:path.resolve(root,'dist/server',emitted.main),assets:{...emitted.assets,directory:path.resolve(root,'dist/server',emitted.assets.directory)},
    d1_databases:emitted.d1_databases.map(db=>({...db,migrations_dir:path.join(root,'migrations/core')})),
    vars:{APP_URL:origin,SETUP_OWNER_EMAIL:ownerEmail,SESSION_SECRET:randomUUID(),LOCAL_DEVELOPMENT:'true',MAIL_PROVIDER:'development',MAIL_FROM:'archive@example.invalid',AI_ENABLED:'false',SSO_ENABLED:'false',LINK_PREVIEWS_ENABLED:'false',RER_DEV_KEY:testDevKey},no_bundle:true};
  await writeFile(configPath,JSON.stringify(config),{mode:0o600});
  const cli=path.join(root,'node_modules/wrangler/bin/wrangler.js');
  const env={...safeEnvironment(),WRANGLER_LOG_PATH:path.join(directory,'logs')};
  // Never surface Wrangler output: it may render the private test configuration.
  async function invoke(args){try{return await command('nice',['-n','15',process.execPath,cli,...args,'--local','--config',configPath,'--persist-to',persist],{cwd:directory,env});}catch{throw Error('Local portability storage command failed.');}}
  let worker;
  async function close(){await stop(worker);worker=undefined;}
  async function start(){worker=launch('nice',['-n','15',process.execPath,cli,'dev','--local','--config',configPath,'--persist-to',persist,'--ip','127.0.0.1','--port',String(port),'--inspector-port',String(inspector)],{cwd:directory,env});try{await waitForReady(origin,worker.child);}catch{await close();throw Error('Local portability Worker did not become ready.');}}
  await invoke(['d1','migrations','apply','DB']);
  return {origin,persist,async start(){await start();},close,
    async sql(sql){assert.equal(worker,undefined,'Stop the Worker before opening D1 from the fixture helper.');return JSON.parse(await invoke(['d1','execute','DB','--command',sql,'--json']));},
    async cli(action,file,cookie){let output;try{output=await command('nice',['-n','15',process.execPath,'src/core/features/portability/command.mjs',action==='export'?'backup':'restore',file],{cwd:root,env:{...env,SLATE_APP_URL:origin,SLATE_SESSION_COOKIE:cookie}});}catch(cause){const code=cause.message.match(/\"code\":\"([A-Z_]+)\"/)?.[1]??'COMMAND_FAILED';throw Error(`Native ZIP ${action} failed against the local deployment: ${code}.`);}const line=output.trim().split('\n').at(-1);const receipt=JSON.parse(line);assert.equal(receipt.state,'completed');return receipt;}};
}

const messageLinks=html=>[...html.matchAll(/href="(\/__dev\/outbox\?message=[^"]+)"/g)].map(match=>match[1]);
/** Mailbox possession through the new message in the real Base development outbox. */
export async function signIn(instance){
  const before=await fetch(instance.origin+'/__dev/outbox',{headers:devKeyHeaders});assert.equal(before.status,200);
  const existing=new Set(messageLinks(await before.text()));
  const response=await fetch(instance.origin+'/api/auth/magic',{method:'POST',headers:{'Content-Type':'application/json',Origin:instance.origin},body:JSON.stringify({email:ownerEmail,requestKey:randomUUID()})});
  assert.equal(response.status,200,'Native magic-link request succeeds.');
  const listing=await fetch(instance.origin+'/__dev/outbox',{headers:devKeyHeaders});assert.equal(listing.status,200);
  const fresh=messageLinks(await listing.text()).filter(link=>!existing.has(link));assert.equal(fresh.length,1,'One new message, rather than an older sign-in link.');
  const detail=await fetch(new URL(fresh[0],instance.origin),{headers:devKeyHeaders});assert.equal(detail.status,200);
  const link=(await detail.text()).match(/class="open" href="([^"]+)"/);assert.ok(link,'Outbox contains the native sign-in link.');
  const target=new URL(link[1].replaceAll('&amp;','&'));assert.equal(target.origin,instance.origin);assert.equal(target.pathname,'/auth/confirm');
  const accepted=await fetch(new URL(target.pathname,target.origin),{method:'POST',headers:{Origin:target.origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:target.searchParams.get('token')}),redirect:'manual'});assert.equal(accepted.status,303);
  return sessionCookie(accepted);
}

export async function api(instance,cookie,url,options={}){
  const response=await fetch(new URL(url,instance.origin),{...options,headers:{Cookie:cookie,Origin:instance.origin,...options.headers}});
  assert.equal(response.status,200,`${options.method??'GET'} ${url} succeeds.`);
  return response;
}
