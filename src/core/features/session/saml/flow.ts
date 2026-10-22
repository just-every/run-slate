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
 }else if(relay)throw new ApiProblem(400,'SAML_INVALID','An unsolicited SAML response cannot carry request state.');
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
