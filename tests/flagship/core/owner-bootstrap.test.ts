import {env} from 'cloudflare:test';
import {beforeEach,test,expect} from 'vitest';
import {resetDeployment} from '../../e2e/setup/reset-deployment';
import {createApi} from '../../../src/core/app/hono';

const token='b'.repeat(64),origin='https://slate.test';
const hosted={...env,SETUP_TOKEN:token} as typeof env;
const claim=(body:unknown,bindings=hosted)=>createApi().request(`${origin}/auth/bootstrap`,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)},bindings);
beforeEach(resetDeployment);

// The hosted owner claim RER makes after the first publication (Base operator-auth's POST /auth/bootstrap).
test('POST /auth/bootstrap claims the setup owner once with the setup token and keeps it afterwards',async()=>{
 const refused=await claim({token:'c'.repeat(64),displayName:'Owner',returnTo:'/'});
 expect(refused.status).toBe(403);expect(await env.DB.prepare('SELECT count(*) n FROM workspaces').first()).toEqual({n:0});
 expect((await claim({token,displayName:'Owner',returnTo:'/'},env)).status).toBe(403);
 const claimed=await claim({token,displayName:'Owner',returnTo:'/'});
 expect(claimed.status).toBe(303);
 expect(await env.DB.prepare("SELECT email,role,is_setup_owner FROM members").all().then(r=>r.results)).toEqual([{email:'owner@slate.test',role:'owner',is_setup_owner:1}]);
 const kept=await claim({token,displayName:'Owner',returnTo:'/'});
 expect(kept.status).toBe(409);expect(await kept.json()).toMatchObject({error:'already_initialized'});
 expect(await env.DB.prepare('SELECT count(*) n FROM workspaces').first()).toEqual({n:1});
});
