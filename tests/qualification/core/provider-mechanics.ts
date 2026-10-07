/** Controlled provider double: no network send/inference. Real D1 and current services. */
import assert from 'node:assert/strict';
import {identityProviderChecks} from './identity-provider';
import {jobChecks} from './jobs';
import {notificationMechanics} from './notification-mechanics';
import {writeFile} from 'node:fs/promises';
import {getPlatformProxy} from 'wrangler';
import {createRuntime} from '../local/runtime.mjs';
import {requestMagicLink,acceptMagicLink} from '../../../src/core/features/session/magic-links';
import {scheduleIdentityMail} from '../../../src/core/features/session/mail';
import {readRuntimeConfig} from '../../../src/core/platform/config/runtime';
import {invite} from '../../../src/core/features/workspace/invitations';
import {bootstrapOwner} from '../../../src/core/features/workspace/bootstrap';
import {probeDependencies} from '../../../src/core/platform/health/dependencies';
const r=await createRuntime({root:process.cwd(),evidence:process.env.QUAL_EVIDENCE!,appPort:Number(process.env.QUAL_APP_PORT),inspectorPort:Number(process.env.QUAL_INSPECTOR_PORT)});
const receipts:any[]=[];let proxy:any;const actualFetch=globalThis.fetch;
try{
 await r.close();
 proxy=await getPlatformProxy({configPath:r.directory+'/wrangler.json',persist:{path:r.persist+'/v3'}});
 const db=proxy.env.DB as D1Database, config=readRuntimeConfig(proxy.env,false);let calls:any[]=[];let outcome='transient';
 globalThis.fetch=(async(input:any,init:any)=>{
 const url=String(input);assert.equal(url,'https://api.resend.com/emails','Only labelled mail provider traffic may reach this test double');calls.push({url,headers:init.headers,body:JSON.parse(init.body)});
 return outcome==='transient'?new Response('{"message":"controlled failure"}',{status:503}):Response.json({id:'TEST-PROVIDER-RECEIPT'});
 }) as typeof fetch;
 async function check(clauses:string[],id:string,fn:()=>Promise<void>){try{await fn();receipts.push({clauses,id,outcome:'pass'});console.log('PASS',id);}catch(error:any){receipts.push({clauses,id,outcome:'fail',error:error.stack});console.log('FAIL',id,error.message);}}
 await check(['WORK-001','WORK-013','BASE-ACCESS-001'],'empty-database-bootstrap-allowlist-and-uniqueness',async()=>{
 await bootstrapOwner(db,config,'not-owner@test.invalid');assert.equal((await db.prepare('SELECT count(*) n FROM workspaces').first<any>()).n,0);
 await Promise.all([bootstrapOwner(db,config,config.setupOwnerEmail!),bootstrapOwner(db,config,config.setupOwnerEmail!)]);assert.equal((await db.prepare('SELECT count(*) n FROM workspaces').first<any>()).n,1);assert.equal((await db.prepare('SELECT count(*) n FROM members').first<any>()).n,1);assert.equal((await db.prepare('SELECT count(*) n FROM pages').first<any>()).n,0);
 });
 await check(['MAIL-001','MAIL-002'],'mail-three-attempts-five-minutes-visible-failure',async()=>{
 await requestMagicLink(db,config,config.setupOwnerEmail!,'qualification-mail-request-0000000000000000');assert.equal(calls.length,1);let row=await db.prepare('SELECT * FROM mail_deliveries').first<any>();assert.equal(row.state,'queued');assert.equal(row.cycle_attempt,1);assert.equal(Date.parse(row.next_attempt_at)-Date.parse(row.cycle_started_at),150000);
 await scheduleIdentityMail(db,config,undefined,row.next_attempt_at);row=await db.prepare('SELECT * FROM mail_deliveries').first<any>();assert.equal(row.cycle_attempt,2);assert.equal(Date.parse(row.next_attempt_at)-Date.parse(row.cycle_started_at),300000);
 await scheduleIdentityMail(db,config,undefined,row.next_attempt_at);row=await db.prepare('SELECT * FROM mail_deliveries').first<any>();assert.equal(calls.length,3);assert.equal(row.state,'failed');assert.equal(row.cycle_attempt,3);assert.match(row.error_detail,/503/);assert.equal(row.next_attempt_at,null);assert.equal(row.sent_at,null);
 await scheduleIdentityMail(db,config,undefined,new Date(Date.now()+600000).toISOString());assert.equal(calls.length,3);assert.equal(calls.every(x=>x.body.from===config.mailFrom),true);
 });
 await check(['BASE-ACCESS-001','BASE-ACCESS-002'],'mail-token-single-use-session-lifetime',async()=>{
 const text=calls[0].body.text;const token=new URL(text.match(/https?:\/\/\S+/)[0]).searchParams.get('token')!;
 const accepted=await acceptMagicLink(db,config,token);assert.ok(accepted.token);assert.ok(Date.parse(accepted.expiresAt)-Date.now()<=30*86400000);await assert.rejects(acceptMagicLink(db,config,token),{code:'LINK_INVALID'});
 });
 await check(['MAIL-001','BASE-ACCESS-001'],'unlisted-address-does-not-send-or-create-actor',async()=>{
 const before=calls.length;assert.deepEqual(await requestMagicLink(db,config,'unlisted@test.invalid'),{accepted:true});assert.equal(calls.length,before);assert.equal((await db.prepare('SELECT count(*) n FROM members').first<any>()).n,1);
 });
 await check(['BASE-SECRET-002'],'required-config-fails-closed-with-variable-name',async()=>{
 for(const name of ['APP_URL','SETUP_OWNER_EMAIL','SESSION_SECRET','MAIL_FROM','MAIL_API_KEY']){const env={...proxy.env,[name]:''};assert.throws(()=>readRuntimeConfig(env,false),new RegExp(name));}
 assert.equal(config.localSampleData,false);assert.equal(config.aiEnabled,false);assert.equal(config.ssoEnabled,false);
 });
 await check(['BASE-OPS-001'],'health-failure-propagates-without-degraded-success',async()=>{
 // A missing binding is a local dependency fault, not a provider simulation.
 await assert.rejects(probeDependencies({database:db,files:undefined as any,jobs:proxy.env.JOBS}));
 });
 await check(['WORK-003','WORK-006','MAIL-001'],'member-invitation-24hour-expiry-and-address-nondisclosure',async()=>{
 const actor:any=await db.prepare('SELECT id,workspace_id AS workspaceId,email,display_name AS displayName,initials,role FROM members LIMIT 1').first();actor.workspaceName='Qualification';const now=new Date().toISOString();const ctx:any={db,files:proxy.env.FILES,jobs:proxy.env.JOBS,actor,now};
 const fresh=await invite(ctx,config,{operationKey:'qualification-new-invite',email:'new-person@test.invalid',kind:'member'});const existing=await invite(ctx,config,{operationKey:'qualification-existing-invite',email:actor.email,kind:'member'});assert.deepEqual(fresh.value,existing.value);assert.deepEqual(fresh.value,{accepted:true});const row=await db.prepare("SELECT created_at,expires_at FROM invitations WHERE email='new-person@test.invalid'").first<any>();assert.equal(Date.parse(row.expires_at)-Date.parse(row.created_at),86400000);
 });
 await notificationMechanics(proxy.env,check);
 await identityProviderChecks(db,config,check);
 await jobChecks(proxy.env,check);
 await writeFile(r.directory+'/provider-mechanics.json',JSON.stringify({date:new Date().toISOString(),artifact:r.artifact.artifactHash,limits:'Service-level real local D1 with controlled Resend transport only. No provider send, inbox delivery or emitted HTTP-path acceptance.',receipts},null,2));
 if(receipts.some(x=>x.outcome==='fail'))process.exitCode=1;
 console.log('Evidence:',r.directory);
}finally{globalThis.fetch=actualFetch;await proxy?.dispose();await r.close();}
