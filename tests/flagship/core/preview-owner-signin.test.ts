import {env} from 'cloudflare:test';
import {beforeEach,test,expect} from 'vitest';
import {resetDeployment} from '../../e2e/setup/reset-deployment';
import {createApi} from '../../../src/core/app/hono';

const setupToken='b'.repeat(64),origin='https://slate.test';
const preview={...env,SETUP_TOKEN:setupToken,RER_PREVIEW:'true'} as typeof env;
const tokenPreview={...env,SETUP_TOKEN:setupToken,RER_PREVIEW_TOKEN:'preview-worker-secret'} as typeof env;
const live={...env,SETUP_TOKEN:setupToken} as typeof env;
const api=createApi();
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
const base64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');

/** The grant exactly as RER's preview-owner-signin.ts writes it: owner by email in oa_operators, string params, 15 minutes. */
async function writeGrant(email:string){
 const owner=await env.DB.prepare("SELECT id,version FROM oa_operators WHERE email=? COLLATE NOCASE AND role='owner' AND status='active' LIMIT 1").bind(email).first<{id:string;version:number}>();
 const token=base64url(crypto.getRandomValues(new Uint8Array(32)));
 const digest=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`owner-signin\0${token}`)));
 const now=Date.now();
 await env.DB.prepare('INSERT INTO oa_owner_signins(id,token_hash,operator_id,operator_version,created_at,expires_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),digest,String(owner!.id),String(owner!.version),String(now),String(now+15*60_000)).run();
 return token;
}
const open=(token:string,bindings=preview)=>api.request(`${origin}/auth/owner-signin?token=${token}`,{},bindings);
/** A refused grant lands on Slate's sign-in page, saying so, with the grant's email when one is known. */
const signInInstead=(response:Response,email?:string)=>{
 expect(response.status).toBe(303);expect(response.headers.get('set-cookie')).toBeNull();
 const location=new URL(response.headers.get('location')!,origin);
 expect(location.pathname).toBe('/signin');expect(location.searchParams.get('owner_link')).toBe('1');
 expect(location.searchParams.get('login_hint')).toBe(email??null);
};
const confirm=(token:string,bindings=preview)=>api.request(`${origin}/auth/owner-signin`,{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token})},bindings);
beforeEach(resetDeployment);

// A Managed preview that copied live opens at RER's owner grant: one grant, one use, owner only, preview only.
test('a preview owner grant signs the owner in once; reuse, expiry and a non-preview Worker fall back to sign-in',async()=>{
 expect((await api.request(`${origin}/auth/bootstrap`,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({token:setupToken,displayName:'Owner',returnTo:'/'})},live)).status).toBe(303);
 const token=await writeGrant('OWNER@slate.test');
 const page=await open(token);
 expect(page.status).toBe(200);expect(await page.text()).toContain('Sign in as the owner of');
 const signedIn=await confirm(token);
 expect(signedIn.status).toBe(303);expect(signedIn.headers.get('location')).toBe('/app');
 const cookie=signedIn.headers.get('set-cookie')!.split(';',1)[0]!;
 const session=await api.request(`${origin}/api/session`,{headers:{cookie}},preview);
 expect(session.status).toBe(200);expect(await session.json()).toMatchObject({member:{email:'owner@slate.test',role:'owner'}});
 // Used once: the same link goes to sign-in with the owner's email, and a second confirm issues nothing.
 signInInstead(await open(token),'owner@slate.test');
 signInInstead(await confirm(token),'owner@slate.test');
 const expired=await writeGrant('owner@slate.test');
 await env.DB.prepare('UPDATE oa_owner_signins SET expires_at=? WHERE consumed_at IS NULL').bind(Date.now()-1).run();
 signInInstead(await open(expired),'owner@slate.test');signInInstead(await confirm(expired),'owner@slate.test');
 // A missing or unknown token names nobody.
 signInInstead(await api.request(`${origin}/auth/owner-signin`,{},preview));
 signInInstead(await open('x'.repeat(43)));
 // The production Worker is not a preview: the grant goes to sign-in and stays unused.
 const outside=await writeGrant('owner@slate.test');
 signInInstead(await open(outside,live),'owner@slate.test');signInInstead(await confirm(outside,live),'owner@slate.test');
 // An earlier RER release marks its previews with the RER_PREVIEW_TOKEN secret instead; the same grant works there.
 expect((await open(outside,tokenPreview)).status).toBe(200);
 expect((await confirm(outside,tokenPreview)).status).toBe(303);
 expect(await env.DB.prepare('SELECT count(*) n FROM oa_owner_signins WHERE consumed_at IS NOT NULL').first()).toEqual({n:2});
 expect(await env.DB.prepare("SELECT count(*) n FROM sessions s JOIN members m ON m.id=s.member_id WHERE m.role='owner'").first()).toEqual({n:3});
});
