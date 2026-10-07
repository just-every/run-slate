import assert from 'node:assert/strict';
import {beginIdentity,finishIdentity} from '../../../src/core/features/session/oidc';
export async function identityProviderChecks(db:D1Database,base:any,check:any){
 const original=globalThis.fetch,issuer='https://controlled-idp.test.invalid',config={...base,ssoEnabled:true,identityIssuerUrl:issuer,identityClientId:'qualification-client',identityClientSecret:'TEST-ONLY-IDP-SECRET'};
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);let jwt='',unavailable=false;
 const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
 globalThis.fetch=(async(input:any)=>{const url=String(input);assert.ok(url.startsWith(issuer+'/'),'Only the controlled IdP test double is reachable');if(unavailable)return new Response('',{status:503});if(url.endsWith('/.well-known/openid-configuration'))return Response.json({issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/keys'});if(url.endsWith('/token'))return Response.json({id_token:jwt});if(url.endsWith('/keys'))return Response.json({keys:[{...jwk,kid:'test-key',alg:'RS256',use:'sig'}]});throw Error('Unexpected test IdP path');}) as typeof fetch;
 try{await check(['WORK-015','BASE-ACCESS-001'],'signed-IdP-allowlist-state-and-failure-boundaries',async()=>{
 for(const email of [base.setupOwnerEmail,'not-invited@test.invalid']){const start=await beginIdentity(db,config),nonce=new URL(start.url).searchParams.get('nonce');const seconds=Math.floor(Date.now()/1000),unsigned=encode({alg:'RS256',kid:'test-key'})+'.'+encode({iss:issuer,aud:config.identityClientId,sub:email,email,email_verified:true,nonce,iat:seconds,exp:seconds+300});jwt=unsigned+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(unsigned))).toString('base64url');
 await assert.rejects(finishIdentity(db,config,{state:start.state,cookieState:'wrong-state',code:'test-code'}),{code:'IDENTITY_STATE'});
 if(email===base.setupOwnerEmail){assert.ok((await finishIdentity(db,config,{state:start.state,cookieState:start.state,code:'test-code'})).token);await assert.rejects(finishIdentity(db,config,{state:start.state,cookieState:start.state,code:'test-code'}),{code:'IDENTITY_STATE'});}else await assert.rejects(finishIdentity(db,config,{state:start.state,cookieState:start.state,code:'test-code'}),{code:'IDENTITY_NOT_INVITED'});
 }
 assert.equal((await db.prepare("SELECT count(*) n FROM members WHERE email='not-invited@test.invalid'").first<any>()).n,0);unavailable=true;await assert.rejects(beginIdentity(db,config),{code:'IDENTITY_UNAVAILABLE'});
 });}finally{globalThis.fetch=original;}
}
