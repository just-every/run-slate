// Connecting Slack on a local `rer dev` Slate, through its dev entry: the owner signs in
// with the RER_OPEN link, chooses Slack, and Slack sends the browser back from its own
// site. That return is a cross-site top-level GET, so the browser sends only the cookies
// whose SameSite allows it. The callback must find the owner signed in and keep the
// connection; a state this sign-in did not start, or none, is still refused.
import {createExecutionContext,env,waitOnExecutionContext} from 'cloudflare:test';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import devWorker from '../../../src/dev/server';
import {resetDatabase} from '../../e2e/setup/reset-database';
import {seedMember,seedWorkspace} from '../../e2e/setup/fixtures';

const ORIGIN='http://localhost:8793',DEV_KEY='fixture-dev-key-0123456789abcdefghijklmnopqrstuvwxyz';
const bindings={...env,APP_URL:ORIGIN,LOCAL_DEVELOPMENT:'true',RER_DEV_KEY:DEV_KEY,SETUP_OWNER_EMAIL:'owner@slate.test',SLACK_CLIENT_ID:'fixture-slack-client-id',SLACK_CLIENT_SECRET:'fixture-slack-client-secret',CONNECTOR_CREDENTIALS_KEY:'01234567890123456789012345678901'} as typeof env;

/** One browser tab on Slate: a cookie jar that applies SameSite as Chromium does (unset means Lax). */
function tab(){
 const jar=new Map<string,{value:string;sameSite:string}>();
 return async(path:string,{method='GET',site='same-origin',body}:{method?:string;site?:'same-origin'|'cross-site';body?:unknown}={})=>{
  const sent=[...jar].filter(([,c])=>site==='same-origin'||(method==='GET'&&c.sameSite!=='strict')).map(([name,c])=>`${name}=${c.value}`).join('; ');
  const headers:Record<string,string>={host:new URL(ORIGIN).host,'sec-fetch-site':site,'sec-fetch-mode':method==='GET'?'navigate':'cors',...(sent?{cookie:sent}:{}),...(method==='GET'?{}:{origin:ORIGIN,'content-type':'application/json'})};
  const ctx=createExecutionContext();
  const response=await devWorker.fetch(new Request(ORIGIN+path,{method,headers,redirect:'manual',...(body===undefined?{}:{body:JSON.stringify(body)})}) as Request<unknown,IncomingRequestCfProperties>,bindings,ctx);
  await waitOnExecutionContext(ctx);
  for(const line of response.headers.getSetCookie()){const [pair,...attributes]=line.split(';').map(part=>part.trim());const at=pair!.indexOf('='),name=pair!.slice(0,at),value=pair!.slice(at+1);const sameSite=attributes.find(a=>/^samesite=/i.test(a))?.split('=')[1]?.toLowerCase()??'lax';if(!value||attributes.some(a=>/^max-age=0$/i.test(a)))jar.delete(name);else jar.set(name,{value,sameSite});}
  return response;
 };
}

beforeEach(async()=>{await resetDatabase(env.DB);});
afterEach(()=>{vi.unstubAllGlobals();});

it('connecting Slack from local dev returns the owner signed in with Slack connected',async()=>{
 const {workspaceId}=await seedWorkspace({name:'Owner OAuth checks'});
 await seedMember(workspaceId,{email:'owner@slate.test',displayName:'Owner',role:'owner',isSetupOwner:true});
 // Slack at the network edge: the token exchange and the identity it reports.
 const calls:string[]=[];
 vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{const url=new URL(input instanceof Request?input.url:String(input));calls.push(url.pathname);
  if(url.href==='https://slack.com/api/oauth.v2.access')return Response.json({ok:true,authed_user:{id:'U0FIXTURE',scope:'channels:history',access_token:'fixture-slack-user-token',token_type:'user'}});
  if(url.origin+url.pathname==='https://slack.com/api/auth.test')return Response.json({ok:true,team_id:'T0FIXTURE',user_id:'U0FIXTURE',user:'owner'});
  throw new Error(`unexpected outbound ${url.href}`);});
 const go=tab();
 // The RER_OPEN link: the hand-off page trades the key for the gate cookie, then enters as the owner.
 expect((await go('/__dev/key',{method:'POST',body:{key:DEV_KEY}})).status).toBe(204);
 expect((await go('/auth/dev/enter?as=owner')).status).toBe(303);
 const signedIn=async(site:'same-origin'|'cross-site')=>(await go('/api/connectors',{site})).status;
 expect(await signedIn('same-origin')).toBe(200);
 const started=await go('/api/connectors/oauth/slack/start',{method:'POST',body:{}});
 expect(started.status,await started.clone().text()).toBe(200);
 const authorize=new URL((await started.json() as {authorizationUrl:string}).authorizationUrl),callback=authorize.searchParams.get('redirect_uri')!;
 expect(callback).toBe(`${ORIGIN}/api/connectors/oauth/slack/callback`);
 const back=(query:Record<string,string>)=>go(`/api/connectors/oauth/slack/callback?${new URLSearchParams(query)}`,{site:'cross-site'});
 const forged=await back({code:'fixture-code',state:'forged'});
 expect([forged.status,(await forged.json() as {code:string}).code]).toEqual([400,'INVALID_OAUTH_STATE']);
 expect((await back({code:'fixture-code'})).status).toBe(400);
 expect(calls).toEqual([]);
 const accepted=await back({code:'fixture-code',state:authorize.searchParams.get('state')!});
 expect([accepted.status,accepted.headers.get('location')]).toEqual([302,'/app/settings?connected=slack']);
 expect(await signedIn('cross-site')).toBe(200);
 expect(await signedIn('same-origin')).toBe(200);
 const kept=await env.DB.prepare('SELECT provider,account_id,state FROM federation_connections').all();
 expect(kept.results).toEqual([{provider:'slack',account_id:'T0FIXTURE',state:'connected'}]);
 expect((await back({code:'fixture-code',state:authorize.searchParams.get('state')!})).status).toBe(400);
},120_000);
