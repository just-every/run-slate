import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
import {invite,revokeInvitation,acceptInvitation} from '../../../src/core/features/workspace/invitations.ts';
import {deliverIdentityMail,scheduleIdentityMail} from '../../../src/core/features/session/mail.ts';
import {listIdentityMail,retryIdentityMail} from '../../../src/core/features/session/mail-status.ts';
import {requestMagicLink,magicLinkStatus,acceptMagicLink} from '../../../src/core/features/session/magic-links.ts';
import {firstRunState,completeFirstRun} from '../../../src/core/features/workspace/bootstrap.ts';
import {excludedTables} from '../../../src/core/features/portability/tables.ts';
import type {FeatureContext} from '../../../src/core/app/feature-context.ts';
import type {RuntimeConfig} from '../../../src/core/platform/config/runtime.ts';
const config:RuntimeConfig={sessionSecret:'a-test-only-secret-of-at-least-32-characters',localSampleData:false,mailApiKey:'test-only-provider-key',mailFrom:'Slate <mail@test.invalid>',appUrl:'https://slate.test.invalid'};
const now=new Date().toISOString();
function fixture(){
 const sql=new DatabaseSync(':memory:',{enableDoubleQuotedStringLiterals:true});
 for(const name of readdirSync('migrations/core').filter(n=>n.endsWith('.sql')).sort())sql.exec(readFileSync(`migrations/core/${name}`,'utf8'));
 let fail:(query:string)=>boolean=()=>false;
 const db={prepare(query:string){let args:any[]=[];const run=()=>{if(fail(query))throw new Error('injected process/storage failure');return sql.prepare(query);};const statement={bind(...values:any[]){args=values;return statement;},async first(column?:string){const row=run().get(...args);return column?row?.[column]??null:row??null;},async all(){return {results:run().all(...args),success:true,meta:{}};},async raw(){return run().all(...args).map(r=>Object.values(r));},async run(){const result=run().run(...args);return {success:true,meta:{changes:result.changes},results:[]};}};return statement;},async batch(statements:any[]){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
 sql.exec("INSERT INTO workspaces(id,name,mark,created_at,updated_at,revision_id) VALUES ('w','Workspace','W','n','n','r'); INSERT INTO members(id,workspace_id,email,display_name,initials,role,is_setup_owner,created_at,updated_at) VALUES ('a','w','a@test.invalid','Owner','A','owner',1,'n','n'),('b','w','b@test.invalid','Member','B','member',0,'n','n');");
 const ctx={db,now,actor:{id:'a',workspaceId:'w',workspaceName:'Workspace',email:'a@test.invalid',displayName:'Owner',initials:'A',role:'owner'}} as FeatureContext;
 return {db,sql,ctx,setFault(fn:(query:string)=>boolean){fail=fn;},close(){sql.close();}};
}
const input=(key=crypto.randomUUID())=>({operationKey:key,email:'new@test.invalid',kind:'member' as const});
const row=(f:ReturnType<typeof fixture>)=>f.sql.prepare('SELECT * FROM mail_deliveries ORDER BY created_at,id LIMIT 1').get() as any;
const after=(milliseconds:number)=>new Date(Date.parse(now)+milliseconds).toISOString();
function provider(fn:(request:RequestInit)=>Promise<Response>){const original=globalThis.fetch;globalThis.fetch=async(_url,init)=>fn(init!);return ()=>{globalThis.fetch=original;};}
function tokenFrom(body:string){return new URL(JSON.parse(body).text.split('\n')[0].split(': ').slice(1).join(': ')).searchParams.get('token')!;}
test('MAIL-002 atomic encrypted admission survives commit-before-dispatch process loss',async()=>{
 const f=fixture();let sentBody='',calls=0;const restore=provider(async init=>{calls++;sentBody=String(init.body);return Response.json({id:'receipt-one'});});
 try{
  f.setFault(q=>q.startsWith('SELECT id FROM mail_deliveries WHERE workspace_id='));
  const request=input();await assert.rejects(invite(f.ctx,config,request),/injected/);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM invitations').get()!.n,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM operation_receipts').get()!.n,1);
  const admitted=row(f);assert.equal(admitted.delivery_phase,'pending');assert.ok(admitted.payload_ciphertext.startsWith('v1.'));assert.ok(!admitted.payload_ciphertext.includes('/accept'));assert.equal(calls,0);
  f.setFault(()=>false);await scheduleIdentityMail(f.db,config,undefined,now);
  assert.equal(calls,1);assert.equal(row(f).provider_message_id,'receipt-one');assert.equal(row(f).payload_ciphertext,null);
  await invite(f.ctx,config,request);assert.equal(calls,1);
  // The recovered ciphertext contains the original still-valid single-use token.
  const token=tokenFrom(sentBody);assert.ok((await acceptInvitation(f.db,config,token)).token);await assert.rejects(acceptInvitation(f.db,config,token),{code:'LINK_INVALID'});
 }finally{restore();f.close();}
});
test('MAIL-002 spaced retry budget, visible HTTP failure, explicit recovery and current authorization',async()=>{
 const f=fixture();let calls=0,ok=false;const bodies:string[]=[],keys:string[]=[];const restore=provider(async init=>{calls++;bodies.push(String(init.body));keys.push(new Headers(init.headers).get('Idempotency-Key')!);return ok?Response.json({id:'receipt-recovered'}):new Response('secret raw provider text',{status:503});});
 try{const request=input();await invite(f.ctx,config,request);const id=row(f).id;assert.equal(calls,1);assert.equal(row(f).next_attempt_at,after(150000));await invite(f.ctx,config,request);await deliverIdentityMail(f.db,config,id,undefined,after(149999));assert.equal(calls,1);
  await scheduleIdentityMail(f.db,config,undefined,after(150000));assert.equal(calls,2);await scheduleIdentityMail(f.db,config,undefined,after(300000));assert.equal(calls,3);assert.equal(row(f).state,'failed');
  const visible=(await listIdentityMail({...f.ctx,now:after(300000)})).items[0];assert.equal(visible.canRetry,true);assert.match(visible.errorDetail!,/503/);assert.ok(!JSON.stringify(visible).includes('secret raw'));assert.ok(!JSON.stringify(visible).includes('ciphertext'));
  await assert.rejects(retryIdentityMail({...f.ctx,actor:{...f.ctx.actor,id:'b',role:'member'},now:after(300000)},config,id),{status:404});
  ok=true;await retryIdentityMail({...f.ctx,now:after(300000)},config,id);assert.equal(row(f).state,'sent');assert.equal(calls,4);assert.equal(new Set(bodies).size,1);assert.equal(new Set(keys).size,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM invitations').get()!.n,1);
  await retryIdentityMail({...f.ctx,now:after(300000)},config,id);assert.equal(calls,4);
 }finally{restore();f.close();}
});
test('MAIL-002 provider accepted response loss is recovered by same payload and idempotency key',async()=>{
 const f=fixture();const accepted=new Map<string,string>();let requests=0;const restore=provider(async init=>{requests++;const key=new Headers(init.headers).get('Idempotency-Key')!,body=String(init.body);if(accepted.has(key))assert.equal(accepted.get(key),body);else accepted.set(key,body);return Response.json({id:'durable-provider-receipt'});});
 try{let lose=true;f.setFault(q=>{if(lose&&q.includes("SET state='sent',delivery_phase='sent'")){lose=false;return true;}return false;});await invite(f.ctx,config,input());assert.equal(row(f).state,'queued');assert.match(row(f).error_detail,/receipt persistence/);
  await scheduleIdentityMail(f.db,config,undefined,after(150000));assert.equal(requests,2);assert.equal(accepted.size,1);assert.equal(row(f).provider_message_id,'durable-provider-receipt');
 }finally{restore();f.close();}
});
test('WORK-006 revocation cancels exactly one invitation and expired leases recheck current grants',async()=>{
 const f=fixture();let calls=0;const restore=provider(async()=>{calls++;return new Response('down',{status:503});});
 try{await invite(f.ctx,config,input());const first=row(f);await invite(f.ctx,config,input());const second=f.sql.prepare('SELECT id FROM invitations WHERE id!=?').get(first.invitation_id)!.id;
  await revokeInvitation(f.ctx,{operationKey:crypto.randomUUID(),id:first.invitation_id});assert.equal(f.sql.prepare('SELECT revoked_at FROM invitations WHERE id=?').get(second)!.revoked_at,null);assert.equal(row(f).delivery_phase,'cancelled');
  f.sql.exec("UPDATE members SET status='removed' WHERE id='a'");await scheduleIdentityMail(f.db,config,undefined,after(150000));assert.equal(calls,2);assert.equal(f.sql.prepare("SELECT count(*) n FROM mail_deliveries WHERE delivery_phase='cancelled'").get()!.n,2);
  await assert.rejects(retryIdentityMail(f.ctx,config,first.id),{status:401});
 }finally{restore();f.close();}
});
test('BASE-ACCESS-001 magic status capability resumes one valid token and discloses no credentials',async()=>{
 const f=fixture();let body='',calls=0;const restore=provider(async init=>{body=String(init.body);calls++;return Response.json({id:'magic-provider-receipt'});});
 try{const key=crypto.randomUUID();await requestMagicLink(f.db,config,'a@test.invalid',key);await requestMagicLink(f.db,config,'a@test.invalid',key);assert.equal(calls,1);assert.equal(row(f).kind,'sign-in-link');assert.equal((await magicLinkStatus(f.db,config,'a@test.invalid',key)).state,'sent');assert.equal((await magicLinkStatus(f.db,config,'a@test.invalid',crypto.randomUUID())).state,'unconfirmed');assert.equal((await magicLinkStatus(f.db,config,'unknown@test.invalid',key)).state,'unconfirmed');assert.equal(f.sql.prepare('SELECT count(*) n FROM magic_links').get()!.n,1);
  const token=tokenFrom(body);assert.ok((await acceptMagicLink(f.db,config,token)).token);await assert.rejects(acceptMagicLink(f.db,config,token),{code:'LINK_INVALID'});for(const name of ['mail_deliveries','magic_links','invitations','sessions'])assert.ok((excludedTables as readonly string[]).includes(name));
 }finally{restore();f.close();}
});
test('WORK-013 completion marker survives an empty tree and later members never receive wizard',async()=>{
 const f=fixture();try{assert.deepEqual(await firstRunState(f.ctx),{required:true,canComplete:true});assert.deepEqual(await firstRunState({...f.ctx,actor:{...f.ctx.actor,id:'b',role:'member'}}),{required:false,canComplete:false});await completeFirstRun(f.ctx,{operationKey:crypto.randomUUID(),workspaceName:'Named',containerName:'First',pageTitle:'Welcome'});assert.deepEqual(await firstRunState(f.ctx),{required:false,canComplete:false});assert.equal(f.sql.prepare('SELECT count(*) n FROM containers').get()!.n,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM pages').get()!.n,1);assert.ok(f.sql.prepare('SELECT first_run_completed_at FROM workspaces').get()!.first_run_completed_at);}finally{f.close();}
});
test('WORK-006 guest retry after restart re-resolves resource grants and refuses stale authority',async()=>{
 const f=fixture();let calls=0;const restore=provider(async()=>{calls++;return new Response('down',{status:503});});
 try{f.sql.exec("INSERT INTO containers(id,workspace_id,name,visibility,guest_access,created_at,updated_at,revision_id) VALUES ('c','w','Shared','open','allowed','n','n','r'); INSERT INTO container_grants(id,container_id,principal_kind,principal_id,level,created_at,updated_at) VALUES ('g','c','member','a','full','n','n');");
  await invite(f.ctx,config,{...input(),kind:'guest',containerId:'c'});assert.equal(calls,1);
  // Durable state left by a process dying after claiming the second send.
  f.sql.prepare("UPDATE mail_deliveries SET delivery_phase='sending',cycle_attempt=2,attempt_count=2,lease_until=?,next_attempt_at=NULL").run(after(60000));
  f.sql.exec("UPDATE container_grants SET revoked_at='revoked' WHERE id='g'");await scheduleIdentityMail(f.db,config,undefined,after(60000));assert.equal(calls,1);assert.equal(row(f).delivery_phase,'cancelled');assert.equal(row(f).payload_ciphertext,null);
 }finally{restore();f.close();}
});
test('MAIL-002 expired provider retention never replays an uncertain message',async()=>{
 const f=fixture();let calls=0;const restore=provider(async()=>{calls++;throw new Error('network response lost');});
 try{await invite(f.ctx,config,input());const id=row(f).id;await scheduleIdentityMail(f.db,config,undefined,after(23*3600000));assert.equal(calls,1);assert.equal(row(f).delivery_phase,'failed');assert.equal(row(f).payload_ciphertext,null);assert.equal((await listIdentityMail({...f.ctx,now:after(23*3600000)})).items[0].canRetry,false);await assert.rejects(retryIdentityMail({...f.ctx,now:after(23*3600000)},config,id),{code:'MAIL_NOT_RECOVERABLE'});assert.equal(calls,1);
 }finally{restore();f.close();}
});
test('MAIL-002 invitation revocation racing an attempt claim fences the provider send',async()=>{
 const f=fixture();let calls=0;const restore=provider(async()=>{calls++;return new Response('down',{status:503});});
 try{await invite(f.ctx,config,input());let race=true;f.setFault(q=>{if(race&&q.startsWith('INSERT INTO core_write_guards')){race=false;f.sql.exec("UPDATE invitations SET revoked_at='revoked'");}return false;});await scheduleIdentityMail(f.db,config,undefined,after(150000));assert.equal(calls,1);assert.equal(row(f).attempt_count,1);
 }finally{restore();f.close();}
});
test('0008 forward migration preserves prior delivery history and records old populated onboarding',()=>{
 const sql=new DatabaseSync(':memory:',{enableDoubleQuotedStringLiterals:true});try{
  for(const name of readdirSync('migrations/core').filter(n=>n.endsWith('.sql')&&n<'0008').sort())sql.exec(readFileSync(`migrations/core/${name}`,'utf8'));
  sql.exec("INSERT INTO workspaces(id,name,mark,created_at,updated_at,revision_id) VALUES ('old','Owner edited','O','before','before','r'); INSERT INTO containers(id,workspace_id,name,visibility,created_at,updated_at,revision_id) VALUES ('old-container','old','Kept','open','before','before','r'); INSERT INTO mail_deliveries(id,workspace_id,kind,target_email,state,attempt_count,error_detail,created_at,updated_at) VALUES ('old-mail','old','sign-in-link','person@test.invalid','failed',3,'prior failure','before','before');");
  sql.exec(readFileSync('migrations/core/0008_identity_mail_outbox.sql','utf8'));assert.equal(sql.prepare("SELECT name FROM workspaces WHERE id='old'").get()!.name,'Owner edited');assert.equal(sql.prepare("SELECT first_run_completed_at FROM workspaces WHERE id='old'").get()!.first_run_completed_at,'before');const legacy=sql.prepare("SELECT * FROM mail_deliveries WHERE id='old-mail'").get()!;assert.equal(legacy.attempt_count,3);assert.equal(legacy.error_detail,'prior failure');assert.equal(legacy.payload_ciphertext,null);assert.equal(legacy.delivery_phase,'legacy');assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{sql.close();}
});
test('SHARE-006 accepting or revoking transfers only the exact pending guest grant',async()=>{
 const f=fixture();const bodies:string[]=[];const restore=provider(async init=>{bodies.push(String(init.body));return Response.json({id:`guest-${bodies.length}`});});try{
  f.sql.exec("INSERT INTO containers(id,workspace_id,name,visibility,guest_access,created_at,updated_at,revision_id) VALUES ('c','w','Shared','open','allowed','n','n','r'); INSERT INTO container_grants(id,container_id,principal_kind,principal_id,level,created_at,updated_at) VALUES ('g','c','member','a','full','n','n');");
  await invite(f.ctx,config,{...input(),kind:'guest',containerId:'c'});const invitation=f.sql.prepare('SELECT * FROM invitations').get()!;const grantId=invitation.container_grant_id;assert.equal(f.sql.prepare('SELECT principal_id FROM container_grants WHERE id=?').get(grantId)!.principal_id,`invitation:${invitation.id}`);
  await acceptInvitation(f.db,config,tokenFrom(bodies[0]),f.ctx);const member=f.sql.prepare("SELECT id FROM members WHERE email='new@test.invalid'").get()!.id;assert.equal(f.sql.prepare('SELECT principal_id FROM container_grants WHERE id=?').get(grantId)!.principal_id,member);assert.equal(f.sql.prepare("SELECT count(*) n FROM container_grants WHERE principal_id=?").get(member)!.n,1);
  await invite(f.ctx,config,{...input(),email:'second@test.invalid',kind:'guest',containerId:'c'});const pending=f.sql.prepare("SELECT * FROM invitations WHERE email='second@test.invalid'").get()!;const {saveGrant}=await import('../../../src/core/features/sharing/grants.ts');await saveGrant(f.ctx,{operationKey:crypto.randomUUID(),targetKind:'container',targetId:'c',id:pending.container_grant_id as string,principalKind:'member',principalId:`invitation:${pending.id}`,level:'view',revoke:true});assert.ok(f.sql.prepare('SELECT revoked_at FROM invitations WHERE id=?').get(pending.id)!.revoked_at);await assert.rejects(acceptInvitation(f.db,config,tokenFrom(bodies[1]),f.ctx),{code:'LINK_INVALID'});assert.equal(f.sql.prepare('SELECT revoked_at FROM container_grants WHERE id=?').get(grantId)!.revoked_at,null);
 }finally{restore();f.close();}
});
test('MAIL-002 interrupted failure persistence retains spacing and provider custody across restart',async()=>{
 const f=fixture();let calls=0;const restore=provider(async()=>{calls++;return new Response('down',{status:503});});try{
  let interrupt=true;f.setFault(q=>{if(interrupt&&q.startsWith('UPDATE mail_deliveries SET state=?')){interrupt=false;return true;}return false;});await assert.rejects(invite(f.ctx,config,input()),/injected/);assert.equal(row(f).delivery_phase,'sending');assert.equal(row(f).next_attempt_at,after(150000));f.setFault(()=>false);
  await scheduleIdentityMail(f.db,config,undefined,after(60000));assert.equal(calls,1);await scheduleIdentityMail(f.db,config,undefined,after(150000));assert.equal(calls,2);
  await scheduleIdentityMail(f.db,{...config,mailApiKey:'different-provider-credential'},undefined,after(300000));assert.equal(calls,2);assert.equal(row(f).state,'failed');assert.match(row(f).error_detail,/MAIL_PROVIDER_CHANGED/);
 }finally{restore();f.close();}
});
