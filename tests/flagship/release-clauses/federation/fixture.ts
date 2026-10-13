import {resetDatabase} from '../../../e2e/setup/reset-database';
import {env} from 'cloudflare:test';
import {expect, vi} from 'vitest';
import {seedWorkspace, seedMember} from '../../../e2e/setup/fixtures';
import type {FeatureContext} from '../../../../src/core/app/feature-context';
import type {NativeIdentity} from '../../../../src/core/features/connectors/native';
import {connect} from '../../../../src/core/features/connectors/service';

export const secret = '01234567890123456789012345678901';
export async function actors() {
 const {workspaceId} = await seedWorkspace();
 const make = async (name:string, role:'owner'|'member') => {
  const email = `${name}@u2.test`;
  const {memberId} = await seedMember(workspaceId,{email,displayName:name,role,isSetupOwner:role==='owner'});
  return {db:env.DB,files:env.FILES,jobs:env.JOBS,actor:{id:memberId,workspaceId,workspaceName:'U2',email,displayName:name,initials:name.slice(0,2).toUpperCase(),role},now:new Date().toISOString()} as FeatureContext;
 };
 return {owner:await make('owner','owner'),other:await make('other','member')};
}
export function fresh(ctx:FeatureContext):FeatureContext {return {...ctx,authorizationEpoch:undefined,now:new Date().toISOString()};}
export async function reset() {
 await resetDatabase(env.DB);
}

/** Only native HTTP transport is controlled. Every service and authorization check stays real. */
export function installation(name:string) {
 const origin = `https://${name}.u2.test`, accountId = `account-${name}`, token = `synthetic-u2-token-${name}`;
 const identity:NativeIdentity = {provider:'happytohelp',protocol:'rer-delegation/1',installationId:`installation-${name}`,accountId,principalId:`principal-${name}`,label:`Controlled ${name}`,grantId:`grant-${name}`,expiresAt:new Date(Date.now()+3600000).toISOString(),scopes:['support.evidence.read'],targets:[`projects/${accountId}/conversations/case1`],capabilities:{readKinds:['support.conversation'],operations:[],conditionalWrite:true,providerIdempotency:true,readBack:true,reconciliationAttribution:true},origin};
 return {origin,token,identity,config:{origin,clientId:'synthetic-u2-client',accountId,allowLoopback:false},target:identity.targets[0]!,revision:'native-r1',title:`Private title ${name}`,text:'retained text',identityStatus:200,checkStatus:200,publicAudience:false,onCheck:undefined as undefined|(()=>Promise<void>)};
}
export type Installation = ReturnType<typeof installation>;
export function trap(installations:Installation[]) {
 const calls:{origin:string;path:string;method:string;status:number}[] = [], unmatched:string[] = [];
 vi.stubGlobal('fetch', async (input:RequestInfo|URL,init?:RequestInit) => {
  const request = new Request(input,init),url = new URL(request.url),target = installations.find(s=>s.origin===url.origin);
  const reject = () => {unmatched.push(`${request.method} ${url}`);throw new Error(`Unmatched U2 provider transport: ${request.method} ${url}`);};
  if(!target||request.headers.get('Authorization')!==`Bearer ${target.token}`||request.redirect!=='manual')return reject();
  const path = url.pathname.replace('/api/delegation/v1/','');
  let body:unknown,status = 200;
  if(request.method==='GET' && path==='identity' && !url.search) {
   status=target.identityStatus;const {origin:_,...value}=target.identity;body=value;
  } else if(request.method==='GET' && ['check','evidence'].includes(path) && url.search===`?target=${encodeURIComponent(target.target)}`) {
   if(path==='check')await target.onCheck?.();
   status = path==='check'?target.checkStatus:200;
   const {provider,installationId,accountId,principalId}=target.identity;
   body={provider,installationId,accountId,principalId,target:target.target,revision:target.revision,observedAt:'2026-10-05T00:00:00.000Z',audience:target.publicAudience?{kind:'public'}:{kind:'source-principals',principalIds:[principalId]},...(path==='evidence'?{title:target.title,text:target.text,canonicalUrl:`${target.origin}/conversations/case1`}:{})};
  } else if(request.method==='POST'&&path==='revoke'&&!url.search&&await request.text()==='{}')body={revoked:true};
  else return reject();
  calls.push({origin:url.origin,path,method:request.method,status});
  return Response.json(status>=400?{error:{code:'CONTROLLED_PROVIDER_REFUSAL'}}:body,{status});
 });
 return {calls,assertClosed(){expect(unmatched).toEqual([]);expect(calls.filter(c=>c.method!=='GET'&&c.path!=='revoke')).toEqual([]);}};
}
export async function connectNative(ctx:FeatureContext,provider:Installation) {
 return connect(fresh(ctx),{operationKey:`connect-${provider.config.accountId}`,provider:'happytohelp',accountId:provider.config.accountId,token:provider.token,nativeConfig:provider.config},secret);
}
