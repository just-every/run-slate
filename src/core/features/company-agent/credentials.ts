import type {AppBindings} from '../../app/types';
import type {AgentDoorOptions,Principal} from '../../../../modules/agent-door/index.ts';
import {authenticateNativeApiToken} from '../public-api/authentication';
import {scopesSchema} from '../public-api/model';

const reads=['slate.pages.list','slate.pages.read','slate.blocks.list','slate.tasks.list'];
const writes=['slate.pages.create','slate.pages.update','slate.blocks.update','slate.blocks.edit','slate.tasks.update'];
export function localCredentials(env:AppBindings):NonNullable<AgentDoorOptions['localCredentials']> {
  return async request=>{
    if(!/^Bearer [A-Za-z0-9_-]{43}$/.test(request.headers.get('authorization')??''))return null;
    try {
      const token=await authenticateNativeApiToken(env.DB,request.headers);
      const record=await env.DB.prepare('SELECT name FROM public_api_tokens WHERE id=? AND revoked_at IS NULL').bind(token.id).first<{name:string}>();
      if(!record)return null;
      return {sponsor:{id:token.member.id},agent:{id:'api-token:'+token.id,name:record.name,specialist:'wiki curator'},clientId:'api-token:'+token.id,scopes:[...reads,...(token.scopes.some(scope=>scope.level==='write')?writes:[])]};
    }catch{return null;}
  };
}
export async function nativeClientGrant(env:AppBindings,principal:Pick<Principal,'person'|'clientId'>) {
  if(!principal.clientId?.startsWith('api-token:'))return null;
  const id=principal.clientId.slice('api-token:'.length);
  const row=await env.DB.prepare('SELECT scopes_json,member_id,expires_at,revoked_at,token_hash FROM public_api_tokens WHERE id=?').bind(id).first<{scopes_json:string;member_id:string;expires_at:string;revoked_at:string|null;token_hash:string|null}>();
  if(!row||row.member_id!==principal.person.id||row.revoked_at||!row.token_hash||row.expires_at<=new Date().toISOString())return {id,valid:false,scopes:[],json:''};
  const scopes=scopesSchema.safeParse(JSON.parse(row.scopes_json));
  return {id,valid:scopes.success,scopes:scopes.success?scopes.data:[],json:row.scopes_json};
}
export function currentScopes(env:AppBindings):NonNullable<AgentDoorOptions['currentScopes']> {
  return async principal=>{const grant=await nativeClientGrant(env,principal);return grant?(grant.valid?[...reads,...(grant.scopes.some(scope=>scope.level==='write')?writes:[])]:[]):[...principal.scopes];};
}
