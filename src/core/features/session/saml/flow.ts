import { deflateRawSync } from 'node:zlib';
import { ApiProblem } from '../../../app/problems';
import { mutationGuard } from '../../../app/operations';
import { createOpaqueToken, sessionDigest } from '../../../platform/auth/token';
import { readCookie } from '../../../platform/auth/cookie';
import { safeAppPath } from '../../../platform/auth/paths';
import type { SessionStore } from '../native/store';
import { samlAdmission } from './admission';
import { readSamlConfig } from './storage';
import { escapeXml, verifySamlResponse } from './xml';
import { FLOW_COOKIE, POST_BINDING, PROTOCOL_NS, SAML_NS, samlEndpoints, type SamlConfig } from './types';

const TTL=600_000;
async function limitedForm(request:Request):Promise<string>{
 const reader=request.body?.getReader();if(!reader)return '';
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>400_000){await reader.cancel();throw new ApiProblem(413,'BODY_TOO_LARGE','The SAML response is too large.');}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new ApiProblem(400,'SAML_INVALID','The SAML response could not be verified.');}
}
const flowCookieName=(secure:boolean)=>secure?`__Host-${FLOW_COOKIE}`:FLOW_COOKIE;
function flowCookie(value:string,secure:boolean,maxAge=600){return `${flowCookieName(secure)}=${value}; Path=${secure?'/':'/auth/saml/acs'}; HttpOnly; SameSite=${secure?'None':'Lax'}; Max-Age=${maxAge}${secure?'; Secure':''}`;}
async function enabled(store:SessionStore):Promise<SamlConfig>{const config=await readSamlConfig(store.db);if(!config?.enabled)throw new ApiProblem(503,'SAML_UNAVAILABLE','SAML sign-in is not available.');return config;}
export function samlMetadata(origin:string) {
 const {entityId,acsUrl}=samlEndpoints(origin);
 return `<?xml version="1.0" encoding="UTF-8"?><md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${escapeXml(entityId)}"><md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="${PROTOCOL_NS}"><md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat><md:AssertionConsumerService Binding="${POST_BINDING}" Location="${escapeXml(acsUrl)}" index="0" isDefault="true"/></md:SPSSODescriptor></md:EntityDescriptor>`;
}
export async function startSaml(request:Request,store:SessionStore,origin:string,now=Date.now()):Promise<Response> {
 const config=await enabled(store),id='_'+crypto.randomUUID(),relay=createOpaqueToken(),browser=createOpaqueToken();
 const {entityId,acsUrl}=samlEndpoints(origin);
 const xml=`<samlp:AuthnRequest xmlns:samlp="${PROTOCOL_NS}" xmlns:saml="${SAML_NS}" ID="${id}" Version="2.0" IssueInstant="${new Date(now).toISOString()}" Destination="${escapeXml(config.sso_url)}" ProtocolBinding="${POST_BINDING}" AssertionConsumerServiceURL="${escapeXml(acsUrl)}"><saml:Issuer>${escapeXml(entityId)}</saml:Issuer><samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/></samlp:AuthnRequest>`;
 await store.db.batch([
  mutationGuard(store.db,'SELECT enabled=1 AND generation=? FROM saml_provider_config WHERE workspace_id=?',[config.generation,config.workspace_id]),
  store.db.prepare('INSERT INTO saml_requests(id,workspace_id,relay_digest,browser_digest,generation,return_to,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,config.workspace_id,await sessionDigest(store.secret,relay),await sessionDigest(store.secret,browser),config.generation,safeAppPath(new URL(request.url).searchParams.get('returnTo')),now,now+TTL),
 ]);
 const url=new URL(config.sso_url);url.searchParams.set('SAMLRequest',Buffer.from(deflateRawSync(Buffer.from(xml))).toString('base64'));url.searchParams.set('RelayState',relay);
 return new Response(null,{status:303,headers:{location:url.toString(),'set-cookie':flowCookie(browser,new URL(origin).protocol==='https:'),'cache-control':'no-store','referrer-policy':'no-referrer'}});
}
async function confirmUnsolicited(store:SessionStore,config:SamlConfig,email:string,pending:string,encoded:string,origin:string,now:number):Promise<Response> {
 const confirmation=createOpaqueToken(),browser=createOpaqueToken();
 await store.db.batch([
  mutationGuard(store.db,'SELECT enabled=1 AND generation=? FROM saml_provider_config WHERE workspace_id=?',[config.generation,config.workspace_id]),
  store.db.prepare('INSERT INTO saml_requests(id,workspace_id,relay_digest,browser_digest,generation,return_to,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET relay_digest=excluded.relay_digest,browser_digest=excluded.browser_digest,created_at=excluded.created_at,expires_at=excluded.expires_at WHERE saml_requests.consumed_at IS NULL').bind(pending,config.workspace_id,await sessionDigest(store.secret,confirmation),await sessionDigest(store.secret,browser),config.generation,'/app',now,now+TTL),
 ]);
 const page=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirm SAML sign-in · Slate</title><style>body{font:18px/1.6 system-ui,sans-serif;color:#20211e;background:#fafaf7;margin:0}main{max-width:36rem;padding:4rem 1.5rem;margin:auto}h1{font-size:2rem;line-height:1.2}button{font:inherit;padding:.6rem 1.2rem;border-radius:.5rem;border:1px solid #145a3d;background:#145a3d;color:#fff;cursor:pointer}a{color:#145a3d;text-decoration:underline}</style></head><body><main><h1>Confirm SAML sign-in</h1><p>Your identity provider signed in <strong>${escapeXml(email)}</strong>. Continue only if you started this sign-in and this is your account.</p><form method="post" action="/auth/saml/acs"><input type="hidden" name="SAMLResponse" value="${escapeXml(encoded)}"><input type="hidden" name="confirmation" value="${escapeXml(confirmation)}"><button type="submit">Sign in to Slate</button></form><p><a href="/signin">Cancel</a></p></main></body></html>`;
 return new Response(page,{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'same-origin','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",'set-cookie':flowCookie(browser,new URL(origin).protocol==='https:')}});
}
export async function consumeSaml(request:Request,store:SessionStore,origin:string,now=Date.now()):Promise<Response> {
 if(request.headers.get('content-type')?.split(';',1)[0]?.trim().toLowerCase()!=='application/x-www-form-urlencoded')throw new ApiProblem(400,'SAML_INVALID','Submit the SAML response using HTTP POST binding.');
 if(Number(request.headers.get('content-length')??0)>400_000)throw new ApiProblem(413,'BODY_TOO_LARGE','The SAML response is too large.');
 const body=await limitedForm(request);
 const form=new URLSearchParams(body),encoded=(form.get('SAMLResponse')??'').replace(/[\r\n\t ]/g,'');
 if(form.getAll('SAMLResponse').length!==1||form.getAll('RelayState').length>1||encoded.length>350_000||!encoded||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))throw new ApiProblem(400,'SAML_INVALID','The SAML response could not be verified.');
 let xml:string;try{xml=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(encoded,'base64'));}catch{throw new ApiProblem(400,'SAML_INVALID','The SAML response could not be verified.');}
 const config=await enabled(store),proof=verifySamlResponse(xml,config,origin,now),relay=form.get('RelayState');
 const statements:D1PreparedStatement[]=[];let returnTo='/app';
 if(proof.inResponseTo){
  const browser=readCookie(request.headers,flowCookieName(new URL(origin).protocol==='https:'));
  if(!relay||relay.length>256||!browser)throw new ApiProblem(400,'SAML_INVALID','The sign-in request is missing or expired. Start sign-in again.');
  const row=await store.db.prepare('SELECT * FROM saml_requests WHERE id=? AND workspace_id=? AND generation=? AND relay_digest=? AND browser_digest=? AND consumed_at IS NULL AND expires_at>?').bind(proof.inResponseTo,config.workspace_id,config.generation,await sessionDigest(store.secret,relay),await sessionDigest(store.secret,browser),now).first<{return_to:string}>();
  if(!row)throw new ApiProblem(400,'SAML_INVALID','The sign-in request is missing or expired. Start sign-in again.');
  returnTo=row.return_to;
  statements.push(store.db.prepare('UPDATE saml_requests SET consumed_at=? WHERE id=? AND workspace_id=? AND generation=? AND relay_digest=? AND browser_digest=? AND consumed_at IS NULL AND expires_at>?').bind(now,proof.inResponseTo,config.workspace_id,config.generation,await sessionDigest(store.secret,relay),await sessionDigest(store.secret,browser),now),mutationGuard(store.db,'SELECT changes()=1',[]));
 }else{
  if(relay)throw new ApiProblem(400,'SAML_INVALID','An unsolicited SAML response cannot carry request state.');
  // An unsolicited response proves an identity, not that this browser chose it: Slate's own page names the account and its same-origin POST, bound to a new browser token, issues the session.
  const confirmation=form.get('confirmation'),pending=`idp:${proof.id}`;
  if(confirmation===null){await samlAdmission(store,config,proof,now);return confirmUnsolicited(store,config,proof.email,pending,encoded,origin,now);}
  const browser=readCookie(request.headers,flowCookieName(new URL(origin).protocol==='https:'));
  if(request.headers.get('origin')!==origin||confirmation.length>256||!browser)throw new ApiProblem(400,'SAML_INVALID','Confirm this sign-in on Slate\'s own page. Start sign-in again.');
  const bound=[pending,config.workspace_id,config.generation,await sessionDigest(store.secret,confirmation),await sessionDigest(store.secret,browser),now] as const;
  if(!await store.db.prepare('SELECT 1 FROM saml_requests WHERE id=? AND workspace_id=? AND generation=? AND relay_digest=? AND browser_digest=? AND consumed_at IS NULL AND expires_at>?').bind(...bound).first())throw new ApiProblem(400,'SAML_INVALID','The sign-in confirmation is missing or expired. Start sign-in again.');
  statements.push(store.db.prepare('UPDATE saml_requests SET consumed_at=? WHERE id=? AND workspace_id=? AND generation=? AND relay_digest=? AND browser_digest=? AND consumed_at IS NULL AND expires_at>?').bind(now,...bound),mutationGuard(store.db,'SELECT changes()=1',[]));
 }
 const admission=await samlAdmission(store,config,proof,now);
 const completed=await store.issue({person:admission.person,kind:'native',now,returnTo,saml:{generation:config.generation},principal:{issuer:proof.issuer,subject:proof.subject,providerGeneration:config.generation},statements:[
  ...statements,
  // Keep the replay marker for the assertion's entire accepted lifetime.
  store.db.prepare('INSERT INTO saml_assertion_replay(issuer,assertion_id,consumed_at,expires_at) VALUES(?,?,?,?)').bind(proof.issuer,proof.id,now,proof.expiresAt),
  ...admission.statements,
  store.db.prepare('INSERT INTO member_identity_bindings(issuer,subject,member_id,created_at) VALUES(?,?,?,?) ON CONFLICT(issuer,subject) DO NOTHING').bind(proof.issuer,proof.subject,admission.person.id,new Date(now).toISOString()),
  mutationGuard(store.db,'SELECT member_id=? FROM member_identity_bindings WHERE issuer=? AND subject=?',[admission.person.id,proof.issuer,proof.subject]),
 ]});
 if(!completed)throw new ApiProblem(400,'SAML_INVALID','The SAML response was already used or workspace access changed. Start sign-in again.');
 const headers=new Headers({location:completed.returnTo,'cache-control':'no-store'});headers.append('set-cookie',completed.cookie);headers.append('set-cookie',flowCookie('',new URL(origin).protocol==='https:',0));
 return new Response(null,{status:303,headers});
}
