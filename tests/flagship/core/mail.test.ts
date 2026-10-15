import {env} from 'cloudflare:test';
import {beforeEach,test,expect,vi} from 'vitest';
import {resetDeployment} from '../../e2e/setup/reset-deployment';
import {seedWorkspace,seedMember,seedContainer,seedContainerGrant,sessionFor} from '../../e2e/setup/fixtures';
import {createApi} from '../../../src/core/app/hono';
import {readRuntimeConfig} from '../../../src/core/platform/config/runtime';
import {invite,revokeInvitation} from '../../../src/core/features/workspace/invitations';
import {scheduleIdentityMail} from '../../../src/core/features/session/mail';
import {retryIdentityMail,listIdentityMail} from '../../../src/core/features/session/mail-status';
import type {FeatureContext} from '../../../src/core/app/feature-context';
const config={...readRuntimeConfig(env,false),appUrl:'https://slate.test.invalid',mailFrom:'Slate <mail@test.invalid>',mailApiKey:'test-only-key'};
beforeEach(resetDeployment);
async function fixture(){const{workspaceId}=await seedWorkspace();const{memberId}=await seedMember(workspaceId,{email:`${workspaceId}@test.invalid`,displayName:'Owner',role:'owner',isSetupOwner:true});return {db:env.DB,files:env.FILES,jobs:env.JOBS,actor:{id:memberId,workspaceId,workspaceName:'Workspace',email:`${workspaceId}@test.invalid`,displayName:'Owner',initials:'O',role:'owner'},now:new Date().toISOString()} as FeatureContext;}
test('MAIL-002 Worker D1 durable retry uses a single encrypted message across five minutes and explicit recovery',async()=>{
 const ctx=await fixture();let success=false;const provider=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>success?Response.json({id:'provider-confirmed'}):new Response('provider raw secret',{status:503}));
 try{const input={operationKey:crypto.randomUUID(),email:'retry@test.invalid',kind:'member' as const};await invite(ctx,config,input);const read=()=>env.DB.prepare('SELECT * FROM mail_deliveries WHERE workspace_id=?').bind(ctx.actor.workspaceId).first<any>();const initial=await read();expect(initial.payload_ciphertext).toMatch(/^v1\./);expect(initial.payload_ciphertext).not.toContain('/accept');expect(provider).toHaveBeenCalledTimes(1);
  await invite(ctx,config,input);expect(provider).toHaveBeenCalledTimes(1);
  // One-minute cron can first observe a 150s deadline at180s. Third remains due300s.
  await scheduleIdentityMail(env.DB,config,ctx,new Date(Date.parse(ctx.now)+180000).toISOString());expect(provider).toHaveBeenCalledTimes(2);expect((await read()).next_attempt_at).toBe(new Date(Date.parse(ctx.now)+300000).toISOString());
  const later={...ctx,now:new Date(Date.parse(ctx.now)+300000).toISOString()};await scheduleIdentityMail(env.DB,config,ctx,later.now);expect(provider).toHaveBeenCalledTimes(3);expect((await read()).state).toBe('failed');const item=(await listIdentityMail(later)).items[0];expect(item.errorDetail).toContain('503');expect(JSON.stringify(item)).not.toContain('provider raw secret');expect(item.canRetry).toBe(true);
  success=true;await retryIdentityMail(later,config,initial.id);expect((await read()).provider_message_id).toBe('provider-confirmed');expect((await read()).payload_ciphertext).toBeNull();const requests=provider.mock.calls.map(call=>call[1]!);expect(new Set(requests.map(r=>new Headers(r.headers).get('Idempotency-Key'))).size).toBe(1);expect(new Set(requests.map(r=>r.body)).size).toBe(1);
 }finally{provider.mockRestore();}
});
test('MAIL-002 Worker routes require current authentication and expose public sign-in status only with capability',async()=>{
 const ctx=await fixture(),api=createApi();const noSession=await api.request('/api/workspace/mail',{},env);expect(noSession.status).toBe(401);const cookie=await sessionFor(ctx.actor.id);expect((await api.request('/api/workspace/mail',{headers:{cookie}},env)).status).toBe(200);
 const status=await api.request('/api/auth/magic/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'unknown@test.invalid',requestKey:crypto.randomUUID()})},env);expect(status.status).toBe(200);expect(await status.json()).toMatchObject({state:'unconfirmed'});
 const relayEnv={...env,APP_URL:'https://slate.test.invalid',MAIL_PROVIDER:'rer',MAIL_FROM:'auth@test.invalid',MAIL_API_KEY:'test-only-relay-key',MAIL_RELAY_URL:'https://management.test.invalid/api/managed-mail/send'};
 let responseStatus=202;
 const provider=vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{
  // Keep workerd's native Request validation in front of the network fake.
  new Request(url,init);
  expect(String(url)).toBe(relayEnv.MAIL_RELAY_URL);expect(init!.method).toBe('POST');expect(init!.redirect).toBe('manual');
  expect(Object.fromEntries(new Headers(init!.headers))).toEqual({authorization:'Bearer test-only-relay-key','content-type':'application/json'});
  const body=JSON.parse(String(init!.body));expect(Object.keys(body).sort()).toEqual(['html','subject','text','to'].filter(key=>key!=='html'||body.html));expect(typeof body.to).toBe('string');expect(body.subject).toBeTruthy();expect(body.text).toBeTruthy();
  return Response.json(responseStatus===202?{accepted:true}:{error:'private relay response'}, {status:responseStatus,headers:responseStatus===429?{'Retry-After':'240'}:responseStatus===302?{Location:'https://untrusted.test.invalid/mail'}:{}});
 });
 try{
  const headers={'content-type':'application/json',origin:relayEnv.APP_URL,host:'slate.test.invalid'};
  const magic=()=>api.request(`${relayEnv.APP_URL}/api/auth/magic`,{method:'POST',headers,body:JSON.stringify({email:ctx.actor.email,requestKey:crypto.randomUUID()})},relayEnv);
  expect((await magic()).status).toBe(200);expect(provider).toHaveBeenCalledTimes(1);
  const signIn=JSON.parse(String(provider.mock.calls[0]![1]!.body));expect(signIn.to).toBe(ctx.actor.email.toLowerCase());expect(signIn.text).toContain('/auth/confirm?token=');
  responseStatus=302;const beforeRedirect=provider.mock.calls.length;expect((await magic()).status).toBe(502);expect(provider).toHaveBeenCalledTimes(beforeRedirect+1);
  responseStatus=401;const refused=await magic();expect(refused.status).toBe(502);expect(await refused.json()).toMatchObject({code:'MAIL_NOT_SENT'});
  const ownerMail=await api.request(`${relayEnv.APP_URL}/api/workspace/mail`,{headers:{cookie}},relayEnv);expect(ownerMail.status).toBe(200);const ownerStatus=await ownerMail.json() as {items:Array<{state:string;errorDetail:string|null}>};expect(ownerStatus.items.some(item=>item.state==='failed'&&typeof item.errorDetail==='string'&&item.errorDetail.length>0)).toBe(true);expect(JSON.stringify(ownerStatus)).not.toContain('private relay response');
  responseStatus=429;
  const invited=await api.request(`${relayEnv.APP_URL}/api/invitations`,{method:'POST',headers:{...headers,cookie},body:JSON.stringify({operationKey:crypto.randomUUID(),email:'relay-invite@test.invalid',kind:'member'})},relayEnv);expect(invited.status).toBe(200);
  const read=()=>env.DB.prepare("SELECT * FROM mail_deliveries WHERE target_email='relay-invite@test.invalid'").first<any>();
  const queued=await read();expect(queued.delivery_phase).toBe('retry');expect(Date.parse(queued.next_attempt_at)-Date.parse(queued.last_attempted_at)).toBe(240000);
  const sentBody=provider.mock.calls.at(-1)![1]!.body,calls=provider.mock.calls.length;
  const relayConfig=readRuntimeConfig(relayEnv,false);
  await scheduleIdentityMail(env.DB,relayConfig,ctx,new Date(Date.parse(queued.next_attempt_at)-1).toISOString());expect(provider).toHaveBeenCalledTimes(calls);
  responseStatus=202;await scheduleIdentityMail(env.DB,relayConfig,ctx,queued.next_attempt_at);expect(provider).toHaveBeenCalledTimes(calls+1);expect(provider.mock.calls.at(-1)![1]!.body).toBe(sentBody);expect(await read()).toMatchObject({delivery_phase:'sent',provider_message_id:null});
  // Without relay idempotency, transport ambiguity stays held instead of replaying.
  responseStatus=503;await api.request(`${relayEnv.APP_URL}/api/invitations`,{method:'POST',headers:{...headers,cookie},body:JSON.stringify({operationKey:crypto.randomUUID(),email:'relay-uncertain@test.invalid',kind:'member'})},relayEnv);
  expect(await env.DB.prepare("SELECT delivery_phase FROM mail_deliveries WHERE target_email='relay-uncertain@test.invalid'").first()).toMatchObject({delivery_phase:'uncertain'});
  responseStatus=302;const beforeInviteRedirect=provider.mock.calls.length;await api.request(`${relayEnv.APP_URL}/api/invitations`,{method:'POST',headers:{...headers,cookie},body:JSON.stringify({operationKey:crypto.randomUUID(),email:'relay-redirect@test.invalid',kind:'member'})},relayEnv);
  expect(provider).toHaveBeenCalledTimes(beforeInviteRedirect+1);expect(await env.DB.prepare("SELECT delivery_phase FROM mail_deliveries WHERE target_email='relay-redirect@test.invalid'").first()).toMatchObject({delivery_phase:'failed'});
 }finally{provider.mockRestore();}
 const first=await api.request('/api/workspace/first-run',{headers:{cookie}},env);expect(await first.json()).toEqual({required:true,canComplete:true});await env.DB.prepare("UPDATE members SET status='removed' WHERE id=?").bind(ctx.actor.id).run();expect((await api.request('/api/workspace/first-run',{headers:{cookie}},env)).status).toBe(401);
});
test('WORK-006 Worker pending guest grant is durable and exact revocation disables delivery',async()=>{
 const ctx=await fixture();const{containerId}=await seedContainer(ctx.actor.workspaceId,{name:'Guest target',ownerMemberId:ctx.actor.id,visibility:'open',guestAccess:'allowed'});await seedContainerGrant(containerId,{principalKind:'member',principalId:ctx.actor.id,level:'full'});
 const provider=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('down',{status:503}));try{await invite(ctx,config,{operationKey:crypto.randomUUID(),email:'guest@test.invalid',kind:'guest',containerId});const invitation=await env.DB.prepare('SELECT id,container_grant_id FROM invitations WHERE workspace_id=?').bind(ctx.actor.workspaceId).first<{id:string;container_grant_id:string}>();expect(invitation!.container_grant_id).toBeTruthy();await revokeInvitation(ctx,{operationKey:crypto.randomUUID(),id:invitation!.id});expect((await env.DB.prepare('SELECT revoked_at FROM container_grants WHERE id=?').bind(invitation!.container_grant_id).first<{revoked_at:string}>())!.revoked_at).toBeTruthy();await scheduleIdentityMail(env.DB,config,ctx,new Date(Date.parse(ctx.now)+300000).toISOString());expect(provider).toHaveBeenCalledTimes(1);}finally{provider.mockRestore();}
});
test('MAIL-002 Worker restart after invitation commit resumes the admitted encrypted command',async()=>{
 const ctx=await fixture(),input={operationKey:crypto.randomUUID(),email:'restart@test.invalid',kind:'member' as const};
 const interrupted=new Proxy(env.DB,{get(target,key){if(key==='prepare')return(query:string)=>{if(query.startsWith('SELECT id FROM mail_deliveries WHERE workspace_id='))throw new Error('process ended after commit');return target.prepare(query);};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 const provider=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({id:'restart-receipt'}));try{await expect(invite({...ctx,db:interrupted},config,input)).rejects.toThrow('process ended after commit');expect(provider).not.toHaveBeenCalled();const command=await env.DB.prepare('SELECT delivery_phase,payload_ciphertext FROM mail_deliveries WHERE workspace_id=?').bind(ctx.actor.workspaceId).first<{delivery_phase:string;payload_ciphertext:string}>();expect(command!.delivery_phase).toBe('pending');expect(command!.payload_ciphertext).toMatch(/^v1\./);
  await scheduleIdentityMail(env.DB,config,ctx,ctx.now);await invite(ctx,config,input);expect(provider).toHaveBeenCalledTimes(1);expect((await env.DB.prepare('SELECT provider_message_id FROM mail_deliveries WHERE workspace_id=?').bind(ctx.actor.workspaceId).first<{provider_message_id:string}>())!.provider_message_id).toBe('restart-receipt');
 }finally{provider.mockRestore();}
});
test('MAIL-002 Worker lost provider response replays identical request without a second logical email',async()=>{
 const ctx=await fixture();const accepted=new Map<string,string>();let attempts=0;const provider=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{attempts++;const key=new Headers(init!.headers).get('Idempotency-Key')!,body=String(init!.body);if(!accepted.has(key)){accepted.set(key,body);throw new Error('provider accepted; response lost');}expect(body).toBe(accepted.get(key));return Response.json({id:'recovered-receipt'});});
 try{await invite(ctx,config,{operationKey:crypto.randomUUID(),email:'lost-response@test.invalid',kind:'member'});await scheduleIdentityMail(env.DB,config,ctx,new Date(Date.parse(ctx.now)+150000).toISOString());expect(attempts).toBe(2);expect(accepted.size).toBe(1);expect((await env.DB.prepare('SELECT state,provider_message_id FROM mail_deliveries WHERE workspace_id=?').bind(ctx.actor.workspaceId).first<{state:string;provider_message_id:string}>())).toMatchObject({state:'sent',provider_message_id:'recovered-receipt'});}finally{provider.mockRestore();}
});
