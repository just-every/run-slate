import {env} from 'cloudflare:test';
import {test,expect,vi} from 'vitest';
import {seedWorkspace,seedMember} from '../../e2e/setup/fixtures';
import {beginIdentity,finishIdentity} from '../../../src/core/features/session/oidc';
import {readRuntimeConfig} from '../../../src/core/platform/config/runtime';
const encode=(value:Uint8Array)=>btoa(String.fromCharCode(...value)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
test('WORK-015 signed configured OIDC validates nonce audience issuer and existing mailbox, then consumes state',async()=>{
 const {workspaceId}=await seedWorkspace(),email=`${workspaceId}@oidc.invalid`;await seedMember(workspaceId,{role:'member',email,displayName:'Identity'});
 const config={...readRuntimeConfig(env,false),ssoEnabled:true,identityIssuerUrl:'https://oidc.example.invalid',identityClientId:'slate-client',identityClientSecret:'private-client-secret'};
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',hash:'SHA-256',modulusLength:2048,publicExponent:new Uint8Array([1,0,1])},true,['sign','verify']) as CryptoKeyPair;
 const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'key-1',alg:'RS256',use:'sig'};let nonce='';
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async(input)=>{
  const url=String(input);
  if(url.endsWith('/.well-known/openid-configuration'))return Response.json({issuer:config.identityIssuerUrl,authorization_endpoint:`${config.identityIssuerUrl}/authorize`,token_endpoint:`${config.identityIssuerUrl}/token`,jwks_uri:`${config.identityIssuerUrl}/keys`});
  if(url.endsWith('/keys'))return Response.json({keys:[jwk]});
  if(url.endsWith('/token')){const head=encode(new TextEncoder().encode(JSON.stringify({alg:'RS256',kid:'key-1'}))),claims=encode(new TextEncoder().encode(JSON.stringify({iss:config.identityIssuerUrl,aud:config.identityClientId,exp:Date.now()/1000+300,iat:Date.now()/1000,sub:'subject-1',email,email_verified:true,nonce}))),signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(`${head}.${claims}`));return Response.json({id_token:`${head}.${claims}.${encode(new Uint8Array(signature))}`});}
  throw new Error('Unexpected test provider endpoint');
 });
 try{const started=await beginIdentity(env.DB,config),url=new URL(started.url);nonce=url.searchParams.get('nonce')!;expect(url.searchParams.get('code_challenge_method')).toBe('S256');const session=await finishIdentity(env.DB,config,{state:started.state,cookieState:started.state,code:'authorized-code'});expect(session.token).toBeTruthy();await expect(finishIdentity(env.DB,config,{state:started.state,cookieState:started.state,code:'replayed-code'})).rejects.toMatchObject({code:'IDENTITY_STATE'});const bad=await beginIdentity(env.DB,config);nonce='wrong-nonce';await expect(finishIdentity(env.DB,config,{state:bad.state,cookieState:bad.state,code:'wrong-nonce-code'})).rejects.toMatchObject({code:'IDENTITY_INVALID'});}finally{fetcher.mockRestore();}
});
