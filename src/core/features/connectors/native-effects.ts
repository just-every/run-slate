import {z} from 'zod';
import type {FeatureContext} from '../../app/feature-context';
import type {ConnectionRow} from './types';
import {ApiProblem} from '../../app/problems';
import {NativeAdapter,nativeTimeSchema} from './native';
import {assertConnectionCurrent} from './authority';
export interface DispatchInput {operationKey:string;target:string;operation?:string;content:Record<string,unknown>;expectedRevision:string;expectedAudienceRevision?:string}
export interface ReconcileInput {operationKey:string;target:string;operation?:string;content:Record<string,unknown>;expectedRevision?:string;expectedAudienceRevision?:string}
const article=z.object({title:z.string(),content:z.string(),summary:z.string(),status:z.enum(['draft','published'])}).strict();
const handoff=z.object({title:z.string(),description:z.string(),assigneeId:z.string().nullable(),dueAt:z.string().nullable(),status:z.enum(['open','completed','cancelled'])}).strict();
const receiptSchema=z.object({id:z.string(),operationKey:z.string(),requestHash:z.string(),provider:z.enum(['happytohelp','orbit']),installationId:z.string(),accountId:z.string(),principalId:z.string(),operation:z.string(),target:z.string(),beforeRevision:z.string(),afterRevision:z.string(),committedAt:nativeTimeSchema}).strict();
const observedSchema=z.object({target:z.string(),revision:z.string(),content:z.record(z.string(),z.unknown()),observedAt:nativeTimeSchema}).strict();
/** Wire canonicalization uses codepoint lexicographic order, independent of host locale. */
export function canonicalNative(value:unknown):string{if(Array.isArray(value))return '['+value.map(canonicalNative).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalNative((value as Record<string,unknown>)[k])).join(',')+'}';if(value===undefined||typeof value==='number'&&!Number.isFinite(value)||['function','symbol','bigint'].includes(typeof value))throw new ApiProblem(400,'INVALID_REQUEST','Expected finite JSON values.');return JSON.stringify(value);}
export async function nativeHash(value:unknown){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalNative(value))))].map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function nativeEffectAdapter(ctx:FeatureContext,row:ConnectionRow,adapter:NativeAdapter){
 const identity=await adapter.identity();await assertConnectionCurrent(ctx,row);
 const operation=adapter.provider==='happytohelp'?'happytohelp.article.update':'orbit.handoff.upsert';
 if(!identity.capabilities.operations.includes(operation))throw new ApiProblem(403,'SCOPE_DENIED','Reconnect with the exact source operation authority.');
 const validate=(input:ReconcileInput)=>{if(input.operation!==operation||!input.expectedRevision||!input.expectedAudienceRevision)throw new ApiProblem(400,'INVALID_EFFECT','An exact operation, source revision and audience revision are required.');const content=(adapter.provider==='happytohelp'?article:handoff).parse(input.content);return {operation:input.operation,target:input.target,expectedRevision:input.expectedRevision,expectedAudienceRevision:input.expectedAudienceRevision,content};};
 async function result(raw:unknown,input:ReconcileInput,reconciliation=false){const parsed=z.object({state:reconciliation?z.literal('confirmed').optional():z.literal('confirmed'),receipt:receiptSchema,observed:observedSchema}).strict().parse(raw);const r=parsed.receipt,expected=validate(input);if(r.provider!==adapter.provider||r.installationId!==identity.installationId||r.accountId!==identity.accountId||r.principalId!==identity.principalId||r.operationKey!==input.operationKey||r.operation!==operation||r.target!==input.target||r.beforeRevision!==input.expectedRevision||r.requestHash!==await nativeHash(expected)||parsed.observed.target!==input.target)throw new ApiProblem(502,'INVALID_EFFECT_RECEIPT','The source receipt does not identify this exact operation.');
 // Commit receipts are non-content audit evidence even if local access changed during dispatch.
 try{await assertConnectionCurrent(ctx,row);await adapter.check(input.target);}catch{return {receipt:r,observed:null,confirmed:true,matches:false,attributable:true,resubmitSafe:false};}
 await assertConnectionCurrent(ctx,row);return {receipt:r,observed:parsed.observed,confirmed:true,matches:canonicalNative(parsed.observed.content)===canonicalNative(input.content),attributable:true,resubmitSafe:false};}
 return {provider:adapter.provider,installationId:identity.installationId,accountId:identity.accountId,capabilities:identity.capabilities,
 async read(target:string){const doc=await adapter.read(target);await assertConnectionCurrent(ctx,row);return {target,revision:doc.revision,content:{text:doc.text} as Record<string,unknown>,observedAt:doc.observedAt,accountId:identity.accountId};},
 async audience(target:string,op:string,intendedStatus?:'draft'|'published'){const value=await adapter.audience(target,op,intendedStatus);await assertConnectionCurrent(ctx,row);return value;},
 async dispatch(input:DispatchInput){const request=validate(input);const before=await adapter.check(input.target);const audience=await adapter.audience(input.target,operation,adapter.provider==='happytohelp'?article.parse(input.content).status:undefined);if(before.revision!==input.expectedRevision)throw new ApiProblem(409,'REVISION_CONFLICT','Source changed before dispatch.');if(audience.audienceRevision!==input.expectedAudienceRevision)throw new ApiProblem(409,'AUDIENCE_CHANGED','Source audience changed before dispatch.');await assertConnectionCurrent(ctx,row);return result(await adapter.request('effects',{method:'POST',body:JSON.stringify({operationKey:input.operationKey,...request})}),input);},
 async reconcile(input:ReconcileInput){validate(input);await assertConnectionCurrent(ctx,row);return result(await adapter.request('effects/'+encodeURIComponent(input.operationKey)),input,true);}
 };
}
