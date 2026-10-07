import {ApiProblem} from '../../app/problems';
import type {RuntimeBindings} from '../../platform/config/runtime';
export type NativeProvider='happytohelp'|'orbit';
export interface NativeConfig {origin:string;clientId:string;accountId:string;allowLoopback:boolean}
export const isNative=(provider:string):provider is NativeProvider=>provider==='happytohelp'||provider==='orbit';
export function nativeConfig(env:RuntimeBindings,provider:NativeProvider):NativeConfig{
 const values=env as unknown as Record<string,unknown>,prefix=provider.toUpperCase()+'_DELEGATION_';
 const origin=values[prefix+'ORIGIN'],clientId=values[prefix+'CLIENT_ID'],accountId=values[prefix+'ACCOUNT_ID'];
 if(typeof origin!=='string'||typeof clientId!=='string'||typeof accountId!=='string'||!clientId||!accountId)throw new ApiProblem(503,'CONNECTOR_CONFIGURATION_REQUIRED',`The deployment owner must configure ${prefix}ORIGIN, ${prefix}CLIENT_ID and ${prefix}ACCOUNT_ID.`);
 const allowLoopback=values.ALLOW_LOOPBACK_DELEGATION==='true';return {origin:validatedOrigin(origin,allowLoopback),clientId,accountId,allowLoopback};
}
export function validatedOrigin(value:string,allowLoopback=false){let url:URL;try{url=new URL(value);}catch{throw new ApiProblem(400,'INVALID_INSTALLATION','Configure an exact native installation origin.');}const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);if(loopback&&!allowLoopback||url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.protocol!=='https:'&&!(allowLoopback&&loopback&&url.protocol==='http:'))throw new ApiProblem(400,'INVALID_INSTALLATION','Configure an HTTPS installation origin; loopback requires explicit local configuration.');return url.origin;}
export function nativeTarget(provider:NativeProvider,target:string,accountId:string){
 const good=provider==='happytohelp'?new RegExp('^projects/'+accountId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/(conversations/[A-Za-z0-9_-]+(?:/messages/[0-9]+-[0-9]+)?|articles/[A-Za-z0-9_-]+)$').test(target):/^(opportunities|contacts|companies|signals)\/[A-Za-z0-9_-]+$|^opportunities\/[A-Za-z0-9_-]+\/handoffs\/[A-Za-z0-9_-]+$/.test(target);
 if(!good)throw new ApiProblem(400,'INVALID_TARGET','Select a supported record in the configured source account.');return target;
}
