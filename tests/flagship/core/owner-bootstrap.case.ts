import {env} from 'cloudflare:test';
import {expect} from 'vitest';
import {resetDeployment} from '../../e2e/setup/reset-deployment';
import {createApi} from '../../../src/core/app/hono';

const token='b'.repeat(64),origin='https://slate.test';
const hosted={...env,SETUP_TOKEN:token,SETUP_OWNER_EMAIL:'qa-inbox@slate.test'} as typeof env;
const claim=(body:unknown,bindings=hosted)=>createApi().request(`${origin}/auth/bootstrap`,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)},bindings);

async function workspaceSnapshot() {
 const read=async(sql:string)=>(await env.DB.prepare(sql).all()).results;
 return {
  workspaces:await read('SELECT id,name,mark,first_run_completed_at FROM workspaces ORDER BY id'),
  members:await read('SELECT id,workspace_id FROM members ORDER BY id'),
  containers:await read('SELECT id,workspace_id FROM containers ORDER BY id'),
  pages:await read('SELECT id,workspace_id,container_id FROM pages ORDER BY id'),
  records:await read('SELECT page_id,database_id FROM database_records ORDER BY page_id'),
  comments:await read('SELECT id,thread_id FROM comments ORDER BY id'),
 };
}

/** Real native HTTP creation, followed by canonical ownership rather than empty lists. */
async function soleWorkspaceContent(cookie:string,bindings:typeof env) {
 const api=createApi();
 const request=(route:string,body?:unknown,method=body===undefined?'GET':'POST')=>api.request(origin+route,{
  method,headers:{cookie,origin,'content-type':'application/json'},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
 },bindings);
 const create=async(route:string,body:Record<string,unknown>)=>{
  const response=await request(route,{operationKey:crypto.randomUUID(),...body});
  expect(response.status).toBeGreaterThanOrEqual(200);expect(response.status).toBeLessThan(300);
  return (await response.json() as {value:{id:string;pageId:string}}).value;
 };
 const workspace=await env.DB.prepare('SELECT id FROM workspaces').first<{id:string}>();
 const container=await create('/api/containers',{name:'Sole workspace guides'});
 const page=await create('/api/pages',{containerId:container.id,title:'Native ownership page'});
 const database=await create('/api/databases',{containerId:container.id,title:'Native ownership records'});
 const record=await create(`/api/databases/${database.id}/records`,{title:'Native ownership record',values:{}});
 const comment=await create(`/api/comments/page/${record.pageId}`,{body:[{text:'Native ownership comment'}]});
 expect((await request(`/api/containers/${container.id}`)).status).toBe(200);
 expect((await request(`/api/pages/${page.pageId}`)).status).toBe(200);
 expect((await request(`/api/databases/${database.id}/records/${record.pageId}`)).status).toBe(200);
 const discussion=await request(`/api/comments/page/${record.pageId}`);
 expect(discussion.status).toBe(200);expect(JSON.stringify(await discussion.json())).toContain(comment.id);
 const snapshot=await workspaceSnapshot();
 expect(snapshot.workspaces).toHaveLength(1);
 expect(snapshot.containers.some(row=>row.id===container.id)).toBe(true);
 expect(snapshot.pages.some(row=>row.id===page.pageId)).toBe(true);
 expect(snapshot.records.some(row=>row.page_id===record.pageId)).toBe(true);
 expect(snapshot.comments.some(row=>row.id===comment.id)).toBe(true);
 expect(snapshot.containers.every(row=>row.workspace_id===workspace!.id)).toBe(true);
 expect(snapshot.pages.every(row=>row.workspace_id===workspace!.id)).toBe(true);
 const records=(await env.DB.prepare('SELECT p.workspace_id AS page_workspace,d.workspace_id AS database_workspace FROM database_records r LEFT JOIN pages p ON p.id=r.page_id LEFT JOIN databases d ON d.id=r.database_id').all()).results;
 expect(records).toHaveLength(1);
 expect(records.every(row=>row.page_workspace===workspace!.id&&row.database_workspace===workspace!.id)).toBe(true);
 const comments=(await env.DB.prepare('SELECT t.workspace_id AS thread_workspace,p.workspace_id AS page_workspace,m.workspace_id AS author_workspace FROM comments c LEFT JOIN comment_threads t ON t.id=c.thread_id LEFT JOIN pages p ON p.id=t.page_id LEFT JOIN members m ON m.id=c.author_member_id').all()).results;
 expect(comments).toHaveLength(1);
 expect(comments.every(row=>row.thread_workspace===workspace!.id&&row.page_workspace===workspace!.id&&row.author_workspace===workspace!.id)).toBe(true);
 // Both unsupported creation routes and the real first-run route leave this
 // populated installation unchanged. A renamed workspace is still the same one.
 for(const route of ['/api/workspace','/api/workspaces'])expect((await request(route,{operationKey:crypto.randomUUID(),name:'Second workspace'})).status).toBe(404);
 const repeat=await request('/api/workspace/first-run',{operationKey:crypto.randomUUID(),workspaceName:'Second workspace',containerName:'Again',pageTitle:'Again'});
 expect(repeat.status).toBe(409);
 expect(await workspaceSnapshot()).toEqual(snapshot);
 console.log('PROBE WORK-001 ownership/no-second-workspace: native container, page, record and comment creation -> one canonical workspace; populated snapshots unchanged after creation and first-run refusals');
}

async function signedOwnerClaimCase() {
 await resetDeployment();
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const publicKey=await crypto.subtle.exportKey('jwk',keys.publicKey);
 const bindings={...hosted,RER_OWNER_CLAIM_ISSUER:'https://issuer.slate.test',RER_OWNER_CLAIM_INSTALLATION_ID:'synthetic-slate-1',RER_OWNER_CLAIM_PUBLIC_KEYS:JSON.stringify({'synthetic-slate-1':publicKey})};
 const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
 const json=(value:unknown)=>encode(new TextEncoder().encode(JSON.stringify(value)));
 const now=Math.floor(Date.now()/1000);
 const body=json({alg:'ES256',typ:'rer-owner-claim+jwt',kid:'synthetic-slate-1'})+'.'+json({v:1,iss:bindings.RER_OWNER_CLAIM_ISSUER,aud:origin,installationId:bindings.RER_OWNER_CLAIM_INSTALLATION_ID,email:bindings.SETUP_OWNER_EMAIL,jti:crypto.randomUUID(),iat:now,exp:now+300});
 const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,new TextEncoder().encode(body));
 const token=body+'.'+encode(new Uint8Array(signature));
 const claim=()=>createApi().request(origin+'/auth/owner-claim',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({token,displayName:'Claim owner'})},bindings);
 const accepted=await claim();expect(accepted.status).toBe(303);
 const snapshot=await workspaceSnapshot();
 expect(snapshot.workspaces).toHaveLength(1);expect(snapshot.containers).toHaveLength(1);expect(snapshot.pages).toHaveLength(1);
 const refused=await claim();expect(refused.status).toBe(409);expect(await refused.json()).toEqual({error:'claim_unavailable'});
 expect(refused.headers.get('set-cookie')).toBeNull();
 expect(await workspaceSnapshot()).toEqual(snapshot);
 const bootstrap=await createApi().request(origin+'/auth/bootstrap',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({token:hosted.SETUP_TOKEN,displayName:'Other owner',returnTo:'/'})},bindings);
 expect(bootstrap.status).toBe(409);expect(await workspaceSnapshot()).toEqual(snapshot);
 console.log('PROBE WORK-001 acceptance-2: signed /auth/owner-claim then replay and /auth/bootstrap -> 303, 409, 409; one workspace and unchanged native records');
}


// The hosted owner claim RER makes after the first publication (Base operator-auth's POST /auth/bootstrap).
export async function ownerBootstrapCase() {
 const refused=await claim({token:'c'.repeat(64),displayName:'Owner',returnTo:'/'});
 expect(refused.status).toBe(403);expect(await env.DB.prepare('SELECT count(*) n FROM workspaces').first()).toEqual({n:0});
 expect((await claim({token,displayName:'Owner',returnTo:'/'},env)).status).toBe(403);
 const claimed=await claim({token,displayName:'Owner',returnTo:'/'});
 expect(claimed.status).toBe(303);
 expect(await env.DB.prepare("SELECT email,display_name,initials,role,is_setup_owner FROM members").all().then(r=>r.results)).toEqual([{email:'qa-inbox@slate.test',display_name:'qa-inbox',initials:'QA',role:'owner',is_setup_owner:1}]);
 const initial=await workspaceSnapshot();
 expect(initial.workspaces).toHaveLength(1);expect(initial.containers).toHaveLength(1);expect(initial.pages).toHaveLength(1);
 const kept=await claim({token,displayName:'Owner',returnTo:'/'});
 expect(kept.status).toBe(409);expect(await kept.json()).toMatchObject({error:'already_initialized'});
 expect(await env.DB.prepare('SELECT count(*) n FROM workspaces').first()).toEqual({n:1});
 expect(kept.headers.get('set-cookie')).toBeNull();expect(await workspaceSnapshot()).toEqual(initial);
 const cookie=claimed.headers.get('set-cookie')!.split(';',1)[0]!;
 // Existing installs can retain stale role initials; session output derives identity afresh.
 await env.DB.prepare("UPDATE members SET initials='OW'").run();
 const session=await createApi().request(`${origin}/api/session`,{headers:{cookie}},hosted);
 expect(session.status).toBe(200);expect(await session.json()).toMatchObject({member:{displayName:'qa-inbox',initials:'QA'}});
 const page=await env.DB.prepare('SELECT id FROM pages LIMIT 1').first<{id:string}>();
 expect((await createApi().request(`${origin}/api/collaboration/${page!.id}/presence`,{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({sessionId:'identity-session',cursor:null})},hosted)).status).toBe(200);
 const presence=await createApi().request(`${origin}/api/collaboration/${page!.id}`,{headers:{cookie}},hosted);
 expect(presence.status).toBe(200);expect(await presence.json()).toMatchObject({presence:[{displayName:'qa-inbox',initials:'QA'}]});
 await soleWorkspaceContent(cookie,hosted);
 await resetDeployment();
 const named=await claim({token,displayName:'Priya Shah',returnTo:'/'});
 expect(named.status).toBe(303);
 const namedCookie=named.headers.get('set-cookie')!.split(';',1)[0]!;
 const namedSession=await createApi().request(`${origin}/api/session`,{headers:{cookie:namedCookie}},hosted);
 expect(await namedSession.json()).toMatchObject({member:{email:'qa-inbox@slate.test',displayName:'Priya Shah',initials:'PS'}});
 await signedOwnerClaimCase();
}
