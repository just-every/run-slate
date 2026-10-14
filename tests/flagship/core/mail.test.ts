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
