import type { RuntimeConfig } from '../../platform/config/runtime';
import { ApiProblem } from '../../app/problems';
import { createOpaqueToken, sessionDigest } from '../../platform/auth/token';
import { mutationGuard } from '../../app/operations';
import { createUlid } from '../../shared/ulid';
const enc=new TextEncoder();
const b64=(v:Uint8Array)=>btoa(String.fromCharCode(...v)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const un64=(v:string)=>Uint8Array.from(atob(v.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
interface Discovery {issuer:string;authorization_endpoint:string;token_endpoint:string;jwks_uri:string}
async function discovery(config:RuntimeConfig):Promise<Discovery>{
  if(!config.ssoEnabled||!config.identityIssuerUrl||!config.identityClientId||!config.identityClientSecret||!config.appUrl)throw new ApiProblem(503,'IDENTITY_UNAVAILABLE','The identity provider is not configured. Magic-link sign-in remains available.');
  const issuer=new URL(config.identityIssuerUrl);if(issuer.protocol!=='https:')throw new ApiProblem(503,'IDENTITY_UNAVAILABLE','The identity issuer must use HTTPS.');
  const response=await fetch(`${issuer.href.replace(/\/$/,'')}/.well-known/openid-configuration`,{redirect:'manual',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new ApiProblem(503,'IDENTITY_UNAVAILABLE','The identity provider is unavailable.');
  const d=await response.json() as Discovery;
  if(d.issuer!==config.identityIssuerUrl||[d.authorization_endpoint,d.token_endpoint,d.jwks_uri].some(v=>{try{return new URL(v).protocol!=='https:'}catch{return true}}))throw new ApiProblem(503,'IDENTITY_INVALID','The identity provider metadata is invalid.');
  return d;
}
export async function beginIdentity(db:D1Database,config:RuntimeConfig){
  const d=await discovery(config),state=createOpaqueToken(),nonce=createOpaqueToken(),verifier=createOpaqueToken(),now=new Date();
  await db.prepare('INSERT INTO identity_states (id,state_digest,nonce,verifier,expires_at,created_at) VALUES (?,?,?,?,?,?)').bind(createUlid(),await sessionDigest(config.sessionSecret,state),nonce,verifier,new Date(now.getTime()+600000).toISOString(),now.toISOString()).run();
  const url=new URL(d.authorization_endpoint);for(const [k,v] of Object.entries({client_id:config.identityClientId!,redirect_uri:new URL('/api/auth/identity/callback',config.appUrl).href,response_type:'code',scope:'openid email',state,nonce,code_challenge:b64(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(verifier)))),code_challenge_method:'S256'}))url.searchParams.set(k,v);
  return {url:url.href,state};
}
export async function finishIdentity(db:D1Database,config:RuntimeConfig,input:{state:string;code:string;cookieState:string}){
  if(input.state!==input.cookieState)throw new ApiProblem(400,'IDENTITY_STATE','Identity state does not match this browser.');
  const now=new Date().toISOString(),d=await discovery(config);
  const state=await db.prepare('SELECT id,nonce,verifier FROM identity_states WHERE state_digest=? AND expires_at>? AND used_at IS NULL').bind(await sessionDigest(config.sessionSecret,input.state),now).first<{id:string;nonce:string;verifier:string}>();
  if(!state)throw new ApiProblem(400,'IDENTITY_STATE','Identity state is expired or used.');
  const response=await fetch(d.token_endpoint,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code:input.code,redirect_uri:new URL('/api/auth/identity/callback',config.appUrl).href,client_id:config.identityClientId!,client_secret:config.identityClientSecret!,code_verifier:state.verifier})});
  if(!response.ok)throw new ApiProblem(503,'IDENTITY_UNAVAILABLE','The identity provider rejected sign-in.');
  const body=await response.json() as {id_token?:string};
  if(!body.id_token)throw new ApiProblem(400,'IDENTITY_INVALID','No signed identity was returned.');
  const parts=body.id_token.split('.');if(parts.length!==3)throw new ApiProblem(400,'IDENTITY_INVALID','Invalid identity token.');
  let header:{alg:string;kid:string},claims:{iss:string;aud:string|string[];azp?:string;exp:number;iat:number;nonce:string;sub:string;email:string;email_verified:boolean};
  try{header=JSON.parse(new TextDecoder().decode(un64(parts[0]!)));claims=JSON.parse(new TextDecoder().decode(un64(parts[1]!)));}catch{throw new ApiProblem(400,'IDENTITY_INVALID','Invalid identity token.');}
  const audience=Array.isArray(claims.aud)?claims.aud:[claims.aud],seconds=Date.now()/1000;
  if(header.alg!=='RS256'||typeof claims.exp!=='number'||!Number.isFinite(claims.exp)||typeof claims.iat!=='number'||!Number.isFinite(claims.iat)||typeof claims.email!=='string'||claims.iss!==d.issuer||!audience.includes(config.identityClientId!)||(audience.length>1&&claims.azp!==config.identityClientId)||claims.exp<=seconds||claims.iat>seconds+60||claims.nonce!==state.nonce||!claims.sub||!claims.email||claims.email_verified!==true)throw new ApiProblem(400,'IDENTITY_INVALID','Identity token validation failed.');
  const keysResponse=await fetch(d.jwks_uri,{redirect:'manual',signal:AbortSignal.timeout(10000)});if(!keysResponse.ok)throw new ApiProblem(503,'IDENTITY_UNAVAILABLE','Identity signing keys are unavailable.');
  const keys=await keysResponse.json() as {keys:(JsonWebKey&{kid?:string;use?:string;alg?:string})[]};const jwk=keys.keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.use||k.use==='sig')&&(!k.alg||k.alg==='RS256'));
  if(!jwk)throw new ApiProblem(400,'IDENTITY_INVALID','Unknown identity signing key.');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,un64(parts[2]!),enc.encode(`${parts[0]}.${parts[1]}`)))throw new ApiProblem(400,'IDENTITY_INVALID','Identity signature validation failed.');
  const member=await db.prepare("SELECT id FROM members WHERE lower(email)=lower(?) AND status='active'").bind(claims.email.toLowerCase()).first<{id:string}>();
  if(!member)throw new ApiProblem(403,'IDENTITY_NOT_INVITED','This identity has no active invited membership.');
  const token=createOpaqueToken(),expiresAt=new Date(Date.parse(now)+30*86400000).toISOString();
  await db.batch([mutationGuard(db,'SELECT used_at IS NULL AND expires_at>? FROM identity_states WHERE id=?',[now,state.id]),mutationGuard(db,"SELECT status='active' FROM members WHERE id=?",[member.id]),db.prepare('UPDATE identity_states SET used_at=?,verifier=\'\' WHERE id=?').bind(now,state.id),db.prepare('INSERT INTO sessions (id,member_id,token_digest,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?)').bind(createUlid(),member.id,await sessionDigest(config.sessionSecret,token),now,now,expiresAt)]);
  return {token,expiresAt};
}
