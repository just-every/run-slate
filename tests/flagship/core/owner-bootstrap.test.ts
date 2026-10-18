import {env} from 'cloudflare:test';
import {beforeEach,test,expect} from 'vitest';
import {resetDeployment} from '../../e2e/setup/reset-deployment';
import {createApi} from '../../../src/core/app/hono';

const token='b'.repeat(64),origin='https://slate.test';
const hosted={...env,SETUP_TOKEN:token,SETUP_OWNER_EMAIL:'qa-inbox@slate.test'} as typeof env;
const claim=(body:unknown,bindings=hosted)=>createApi().request(`${origin}/auth/bootstrap`,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)},bindings);
beforeEach(resetDeployment);

// The hosted owner claim RER makes after the first publication (Base operator-auth's POST /auth/bootstrap).
test('POST /auth/bootstrap claims the setup owner once with the setup token and keeps it afterwards',async()=>{
 const refused=await claim({token:'c'.repeat(64),displayName:'Owner',returnTo:'/'});
 expect(refused.status).toBe(403);expect(await env.DB.prepare('SELECT count(*) n FROM workspaces').first()).toEqual({n:0});
 expect((await claim({token,displayName:'Owner',returnTo:'/'},env)).status).toBe(403);
 const claimed=await claim({token,displayName:'Owner',returnTo:'/'});
 expect(claimed.status).toBe(303);
 expect(await env.DB.prepare("SELECT email,display_name,initials,role,is_setup_owner FROM members").all().then(r=>r.results)).toEqual([{email:'qa-inbox@slate.test',display_name:'qa-inbox',initials:'QA',role:'owner',is_setup_owner:1}]);
 const kept=await claim({token,displayName:'Owner',returnTo:'/'});
 expect(kept.status).toBe(409);expect(await kept.json()).toMatchObject({error:'already_initialized'});
 expect(await env.DB.prepare('SELECT count(*) n FROM workspaces').first()).toEqual({n:1});
 const cookie=claimed.headers.get('set-cookie')!.split(';',1)[0]!;
 // Existing installs can retain stale role initials; session output derives identity afresh.
 await env.DB.prepare("UPDATE members SET initials='OW'").run();
 const session=await createApi().request(`${origin}/api/session`,{headers:{cookie}},hosted);
 expect(session.status).toBe(200);expect(await session.json()).toMatchObject({member:{displayName:'qa-inbox',initials:'QA'}});
 const page=await env.DB.prepare('SELECT id FROM pages LIMIT 1').first<{id:string}>();
 expect((await createApi().request(`${origin}/api/collaboration/${page!.id}/presence`,{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({sessionId:'identity-session',cursor:null})},hosted)).status).toBe(200);
 const presence=await createApi().request(`${origin}/api/collaboration/${page!.id}`,{headers:{cookie}},hosted);
 expect(presence.status).toBe(200);expect(await presence.json()).toMatchObject({presence:[{displayName:'qa-inbox',initials:'QA'}]});
 await resetDeployment();
 const named=await claim({token,displayName:'Priya Shah',returnTo:'/'});
 expect(named.status).toBe(303);
 const namedCookie=named.headers.get('set-cookie')!.split(';',1)[0]!;
 const namedSession=await createApi().request(`${origin}/api/session`,{headers:{cookie:namedCookie}},hosted);
 expect(await namedSession.json()).toMatchObject({member:{email:'qa-inbox@slate.test',displayName:'Priya Shah',initials:'PS'}});
});
