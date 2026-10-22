import {SELF,env} from 'cloudflare:test';import {test,expect,vi} from 'vitest';
import {seedWorkspace,seedMember,sessionFor} from '../../e2e/setup/fixtures';
import {createApi} from '../../../src/core/app/hono';
import {createOpaqueToken,sessionDigest} from '../../../src/core/platform/auth/token';
import {acceptInvitation} from '../../../src/core/features/workspace/invitations';
import {createUlid} from '../../../src/core/shared/ulid';
import {readRuntimeConfig} from '../../../src/core/platform/config/runtime';
import {encryptSecret,decryptSecret} from '../../../src/core/platform/secrets/custody';
const config=readRuntimeConfig(env,false);
async function identity(){const {workspaceId}=await seedWorkspace();const email=`${workspaceId}@test.invalid`;const {memberId}=await seedMember(workspaceId,{role:'owner',email,displayName:'Owner'});return {workspaceId,email,memberId};}
test('BASE-ACCESS-002 private HTTP denies missing expired and revoked sessions without data',async()=>{
 const who=await identity();const api=createApi();
 const cookies=[undefined,await sessionFor(who.memberId,{expiresAt:'2000-01-01T00:00:00.000Z'}),await sessionFor(who.memberId,{revokedAt:new Date().toISOString()})];
 for(const cookie of cookies){const response=await api.request('/api/workspace',{headers:cookie?{cookie}:{}},env);expect(response.status).toBe(401);expect(await response.json()).toEqual({code:'UNAUTHENTICATED',message:'A valid session is required.'});}
 const cookie=await sessionFor(who.memberId);const response=await api.request('/api/workspace',{headers:{cookie}},env);expect(response.status).toBe(200);expect((await response.json() as {id:string}).id).toBe(who.workspaceId);

 // The deploy hook retires its owner-claim session through the root alias.
 // Exercise the real Worker dispatcher, with exactly the hook's JSON headers/body.
 const origin='https://slate.test';
 const session=(cookie:string)=>SELF.fetch(origin+'/api/session',{headers:{cookie}});
 const signOut=(path:string,cookie?:string,requestOrigin=origin)=>SELF.fetch(origin+path,{
  method:'POST',redirect:'manual',headers:{Origin:requestOrigin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:'{}',
 });
 for(const path of ['/auth/signout','/api/auth/logout']){
  const anonymous=await signOut(path);expect(anonymous.status).toBe(204);
  const active=await sessionFor(who.memberId,{freshProof:true});
  expect((await session(active)).status).toBe(200);
  const denied=await signOut(path,active,'https://attacker.invalid');
  expect(denied.status).toBe(403);expect(denied.headers.get('set-cookie')).toBeNull();
  expect((await session(active)).status).toBe(200);
  const retired=await signOut(path,active);
  expect(retired.status).toBe(204);expect(retired.redirected).toBe(false);expect(await retired.text()).toBe('');
  const cleared=retired.headers.get('set-cookie')??'';
  expect(cleared).toMatch(/^slate_session=;/);expect(cleared).toContain('Max-Age=0');expect(cleared).toContain('Path=/');
  expect((await session(active)).status).toBe(401);
  const revoked=await signOut(path,active);expect(revoked.status).toBe(204);expect(revoked.headers.get('set-cookie')).toBe(cleared);
  expect(anonymous.headers.get('set-cookie')).toBe(cleared);
 }
});
test('WORK-006 invitation concurrent replay creates exactly one active member',async()=>{const who=await identity(),token=createOpaqueToken(),email=`invited-${who.workspaceId}@test.invalid`,now=new Date().toISOString();await env.DB.prepare("INSERT INTO invitations (id,workspace_id,email,kind,token_digest,invited_by_member_id,expires_at,created_at) VALUES (?,?,?,'member',?,?,?,?)").bind(createUlid(),who.workspaceId,email,await sessionDigest(config.sessionSecret,token),who.memberId,'2099-01-01T00:00:00.000Z',now).run();const outcomes=await Promise.allSettled([acceptInvitation(env.DB,config,token),acceptInvitation(env.DB,config,token)]);expect(outcomes.filter(o=>o.status==='fulfilled')).toHaveLength(1);expect((await env.DB.prepare('SELECT count(*) AS n FROM members WHERE email=?').bind(email).first<{n:number}>())!.n).toBe(1);});
test('BASE-SECRET-001 credential ciphertext is identity bound and failure reveals no plaintext',async()=>{const secret='synthetic-a-strong-owned-key-with-more-than-32-characters',plain='private-provider-token';const value=await encryptSecret(secret,plain,'workspace:connector:a');expect(value).not.toContain(plain);expect(await decryptSecret(secret,value,'workspace:connector:a')).toBe(plain);await expect(decryptSecret(secret,value,'workspace:connector:b')).rejects.toMatchObject({code:'CREDENTIAL_UNAVAILABLE'});});
test("cross-origin cookie mutations and WebSocket handshakes are denied before authorization or writes",async()=>{
 // Independent fixtures exercise the same behaviour through both paths.
 for(const scenario of [async()=>{const who=await identity();const response=await createApi().request('http://localhost:8787/api/members/current/theme',{method:'PUT',headers:{cookie:await sessionFor(who.memberId),'content-type':'application/json',origin:'https://attacker.invalid'},body:JSON.stringify({operationKey:'case:001',theme:'dark'})},env);expect(response.status).toBe(403);expect((await env.DB.prepare('SELECT theme FROM members WHERE id=?').bind(who.memberId).first<{theme:string}>())!.theme).toBe('system');},
async()=>{const who=await identity();const response=await createApi().request('http://localhost:8787/api/collaboration/private/socket',{headers:{cookie:await sessionFor(who.memberId),origin:'https://attacker.invalid',upgrade:'websocket'}},env);expect(response.status).toBe(403);expect((await response.json() as {code:string}).code).toBe('ORIGIN_DENIED');}])await scenario();
});
test('AI local configuration requires real bridge credentials and is refused on hosted runtime',()=>{expect(()=>readRuntimeConfig({LOCAL_DEVELOPMENT:'true',APP_URL:'http://127.0.0.1:8787',SETUP_OWNER_EMAIL:'owner@test.invalid',MAIL_PROVIDER:'development',MAIL_FROM:'slate@test.invalid',SESSION_SECRET:'test',AI_ENABLED:'true',AI_PROVIDER:'local-codex',AI_MODEL:'gpt-6'},true)).toThrow('AI_LOCAL_URL, AI_LOCAL_TOKEN');expect(readRuntimeConfig({LOCAL_DEVELOPMENT:'true',APP_URL:'http://127.0.0.1:8787',SETUP_OWNER_EMAIL:'owner@test.invalid',MAIL_PROVIDER:'development',MAIL_FROM:'slate@test.invalid',SESSION_SECRET:'test',AI_ENABLED:'true',AI_PROVIDER:'local-codex',AI_MODEL:'gpt-6',AI_LOCAL_URL:'http://127.0.0.1:49321',AI_LOCAL_TOKEN:'real-local-token'},true).aiProvider).toBe('local-codex');expect(()=>readRuntimeConfig({...env,AI_PROVIDER:'local-codex'},false)).toThrow('development-only');});

test('WORK-006 invitation cannot smuggle an unowned container through an authorized page or member invite',async()=>{const {invite}=await import('../../../src/core/features/workspace/invitations');const who=await identity(),actor={id:who.memberId,workspaceId:who.workspaceId,workspaceName:'Test',email:who.email,displayName:'Owner',initials:'OW',role:'owner' as const},ctx={db:env.DB,files:env.FILES,jobs:env.JOBS,actor,now:new Date().toISOString()};await expect(invite(ctx,config,{operationKey:'case:002',email:'new@test.invalid',kind:'guest',pageId:'owned-page',containerId:'other-container'})).rejects.toMatchObject({code:'INVALID_INVITATION_SCOPE'});await expect(invite(ctx,config,{operationKey:'case:003',email:'new@test.invalid',kind:'member',containerId:'other-container'})).rejects.toMatchObject({code:'INVALID_INVITATION_SCOPE'});});

test('WORK-006 concurrent identical invite sends one provider request and returns one receipt',async()=>{const {invite}=await import('../../../src/core/features/workspace/invitations');const who=await identity(),actor={id:who.memberId,workspaceId:who.workspaceId,workspaceName:'Test',email:who.email,displayName:'Owner',initials:'OW',role:'owner' as const},ctx={db:env.DB,files:env.FILES,jobs:env.JOBS,actor,now:new Date().toISOString()};const sender=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({id:'test-mail-id'}));try{const input={operationKey:'case:004',email:'new-parallel@test.invalid',kind:'member' as const},settings={...config,appUrl:'https://slate.test.invalid',mailApiKey:'test-key',mailFrom:'Slate <mail@test.invalid>'};const [a,b]=await Promise.all([invite({...ctx},settings,input),invite({...ctx},settings,input)]);expect(a).toEqual(b);expect(sender).toHaveBeenCalledTimes(1);expect((await env.DB.prepare('SELECT count(*) AS n FROM invitations WHERE workspace_id=?').bind(who.workspaceId).first<{n:number}>())!.n).toBe(1);}finally{sender.mockRestore();}});
