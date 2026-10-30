import {env} from 'cloudflare:test';
import {expect} from 'vitest';
import {createApi} from '../../../src/core/app/hono';
import {document_sha256} from '../../../modules/agent-door/policy/document';

/** Pair each real test deployment through the signed settings and policy doors. */
export async function archiveAgentFixture(cookie: () => string) {
  const origin = 'https://slate.test', issuer = 'https://business.example.test';
  const keys = await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const publicKeys = {'synthetic-slate-key':await crypto.subtle.exportKey('jwk',keys.publicKey)};
  const encode = (value: unknown) => btoa(typeof value === 'string' ? value : JSON.stringify(value)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  const sign = async (typ: string, payload: unknown) => {
    const message = `${encode({alg:'ES256',typ,kid:'synthetic-slate-key'})}.${encode(payload)}`;
    const signature = await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,new TextEncoder().encode(message));
    return `${message}.${encode(String.fromCharCode(...new Uint8Array(signature)))}`;
  };
  let installation = 'synthetic-slate-source';
  const request = async (method: string, path: string, body?: unknown, token?: string) => {
    const response = await createApi().request(origin+path,{
      method,headers:{origin,'content-type':'application/json',...(token?{authorization:`Bearer ${token}`,'MCP-Protocol-Version':'2025-11-25','Mcp-Method':'tools/call','Mcp-Name':'slate.containers.create'}:{cookie:cookie()})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
    },{...env,APP_URL:origin,SLATE_PROFILE:undefined,RER_OWNER_CLAIM_ISSUER:issuer,RER_OWNER_CLAIM_INSTALLATION_ID:installation,RER_OWNER_CLAIM_PUBLIC_KEYS:JSON.stringify(publicKeys),
      RER_BUSINESS_TRUST:JSON.stringify({v:1,issuer,audience:'self-host',subject:installation,keys:publicKeys})});
    return {status:response.status,body:await response.json<any>()};
  };
  const pair = async (id: string, paused: boolean) => {
    installation = id;
    const now = Math.floor(Date.now()/1000), business = id+'-business', person = id+'-owner';
    const settings = await sign('rer-business-settings+jwt',{v:1,iss:issuer,aud:'self-host',sub:id,business,email:'owner@slate.test',owner_id:person,jti:crypto.randomUUID(),iat:now,exp:now+3600,rev:1,values:{display_name:id},logo:null,team:null});
    expect((await request('POST','/api/rer/business-settings',{settings})).status).toBe(200);
    const document = {schema:'rer-agent-policy/1' as const,catalogue:'rer-agent-classes/1' as const,rules:[{id:'all',class:'*' as const,do:'autonomous' as const}],spend:{none:true as const}};
    const revision_signature = await sign('rer-agent-policy-revision+jwt',{business,revision:1,document_sha256:await document_sha256(document)});
    const policy = await sign('rer-agent-policy+jwt',{v:1,iss:issuer,aud:origin,sub:id,business,seq:1,revision:1,paused,catalogue:document.catalogue,document,revision_signature,iat:now,exp:now+3600});
    expect((await request('POST','/api/rer/agent-policy',{policy})).status).toBe(200);
    const token = await sign('at+jwt',{iss:issuer,aud:origin+'/mcp',sub:person,email:'owner@slate.test',act:{sub:id+'-agent',name:id+' agent'},client_id:id+'-client',business,jti:crypto.randomUUID(),consent:id+'-consent',scope:'slate:write',iat:now,exp:now+900});
    const freshToken = () => sign('at+jwt',{iss:issuer,aud:origin+'/mcp',sub:person,email:'owner@slate.test',act:{sub:id+'-agent-'+crypto.randomUUID(),name:id+' new agent'},client_id:id+'-new-client',business,jti:crypto.randomUUID(),consent:id+'-new-consent',scope:'slate:write',iat:now,exp:now+900});
    return {token,freshToken,state:(await request('GET','/agents/api/state')).body};
  };
  const createContainer = (token: string) => request('POST','/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'slate.containers.create',arguments:{name:'Imported authority must not create this',idempotency_key:crypto.randomUUID()}}},token);
  return {pair,request,createContainer};
}
