import {ToolRefusal, type ToolContext, type ResourceContext} from '../../../../modules/agent-door/index.ts';
import type {FeatureContext} from '../../app/feature-context';
import type {AppBindings} from '../../app/types';
import {ApiProblem} from '../../app/problems';
import {mutationGuard} from '../../app/operations';
import {requestHash} from '../../app/request-hash';
import {nativeMember} from './people';
export async function nativeContext(env:AppBindings,ctx:ToolContext|ResourceContext):Promise<FeatureContext> {
 const admitted='actor' in ctx?await env.DB.prepare('SELECT envelope,local_revision FROM agent_door_state WHERE id=1').first<{envelope:string|null;local_revision:number}>():null;
 return {db:env.DB,files:env.FILES,jobs:env.JOBS,actor:await nativeMember(env.DB,ctx.person.id),now:new Date('now' in ctx?ctx.now():Date.now()).toISOString(),...('actor' in ctx?{credentialGuard:()=>mutationGuard(env.DB,`SELECT EXISTS(SELECT 1 FROM agent_door_state s WHERE s.id=1 AND s.envelope IS ? AND s.local_revision=? AND s.local_paused=0 AND COALESCE(json_extract(s.envelope,'$.paused'),0)=0 AND NOT EXISTS(SELECT 1 FROM json_each(s.envelope,'$.revoked.agents') WHERE value=?) AND NOT EXISTS(SELECT 1 FROM json_each(s.envelope,'$.revoked.consents') WHERE value=?) AND NOT EXISTS(SELECT 1 FROM agent_door_agents WHERE id=? AND (revoked=1 OR sponsor<>?)))`,[admitted?.envelope??null,admitted?.local_revision??0,ctx.agent.id,ctx.consent??null,ctx.agent.id,ctx.person.id]),agentAttribution:{agent:{id:ctx.agent.id,name:ctx.agent.name},for:{id:ctx.person.id,name:ctx.person.name},label:ctx.actor.label,approvers:ctx.approvers.map(p=>({...p})),operationId:ctx.operationId}}:{})};
}
export async function nativeCall<T>(call:()=>Promise<T>):Promise<T>{
 try{return await call();}catch(error){if(error instanceof ApiProblem)throw new ToolRefusal(error.code,error.message);throw error;}
}
export async function operationKey(ctx:ToolContext,tool:string){return 'door:'+await requestHash({person:ctx.person.id,agent:ctx.agent.id,client:ctx.clientId??null,tool,key:ctx.idempotencyKey});}

/** Match the native HTTP JSON projection, including omission of optional undefined fields. */
export function nativeJson<T>(value:T):T{return JSON.parse(JSON.stringify(value)) as T;}
