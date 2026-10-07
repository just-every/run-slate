export {resolveEffectAudience} from './effect-audience';
import {NativeAdapter} from './native';
import {nativeEffectAdapter,type DispatchInput,type ReconcileInput} from './native-effects';
import {assertConnectionCurrent} from './authority';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {accessToken} from './credentials';
import {adapterFor,connection} from './service';
import {githubRevision} from './github';
import {providerJson} from './http';
export interface IssueContent {title?:string;body?:string;state?:'open'|'closed'}
export async function getEffectAdapter(ctx:FeatureContext,connectionId:string,secret:string|undefined){
 const row=await connection(ctx,connectionId);const adapter=await adapterFor(ctx,row,secret);if(adapter instanceof NativeAdapter)return nativeEffectAdapter(ctx,row,adapter);if(row.provider!=='github')throw new ApiProblem(422,'UNSUPPORTED_EFFECT','This connector has no supported write API.');const identity=await(await adapterFor(ctx,row,secret)).identity();if(identity.accountId!==row.account_id)throw new ApiProblem(403,'SOURCE_IDENTITY_CHANGED','Reconnect the provider identity.');
 const token=await accessToken(ctx,row,secret!);
 const url=(target:string)=>{if(!/^[\w.-]+\/[\w.-]+\/\d+$/.test(target))throw new ApiProblem(400,'INVALID_TARGET','Use owner/repository/issue-number.');const [owner,repo,num]=target.split('/');return `https://api.github.com/repos/${owner}/${repo}/issues/${num}`;};
 const read=async(target:string)=>{await adapterFor(ctx,await connection(ctx,connectionId),secret);const issue=await providerJson<{id:number;title:string;body:string|null;state:string;updated_at:string;html_url:string;number:number}>(url(target),token);await assertConnectionCurrent(ctx,row);return {accountId:row.account_id,target,revision:await githubRevision(issue),content:{title:issue.title,body:issue.body??'',state:issue.state},providerId:String(issue.id),url:issue.html_url,observedAt:new Date().toISOString()};};
 const matches=(actual:Awaited<ReturnType<typeof read>>,wanted:Record<string,unknown>)=>Object.entries(wanted).every(([key,value])=>actual.content[key as keyof IssueContent]===value);
 return {provider:'github' as const,installationId:undefined,accountId:row.account_id,capabilities:{operations:['github.issue.update'],conditionalWrite:false,providerIdempotency:false,readBack:true,reconciliationAttribution:false},read,
 async dispatch(input:DispatchInput){if(!Object.keys(input.content).length||Object.keys(input.content).some(k=>!['title','body','state'].includes(k)))throw new ApiProblem(400,'INVALID_EFFECT_CONTENT','Supply supported issue fields.');const before=await read(input.target);if(before.revision!==input.expectedRevision)throw new ApiProblem(409,'SOURCE_CHANGED','The issue changed before dispatch.');await assertConnectionCurrent(ctx,row);const response=await fetch(url(input.target),{method:'PATCH',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'Slate','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify(input.content),redirect:'manual',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new ApiProblem(502,'EFFECT_PROVIDER_FAILED',`GitHub returned HTTP ${response.status}; reconcile before repeating an uncertain request.`);const receipt=await response.json() as {id:number;updated_at:string};const observed=await read(input.target);return {receipt:{provider:'github',accountId:row.account_id,providerId:String(receipt.id),revision:receipt.updated_at,requestId:response.headers.get('x-github-request-id'),operationKey:input.operationKey},observed,confirmed:matches(observed,input.content)};},
 async reconcile(input:ReconcileInput){const observed=await read(input.target);return {operationKey:input.operationKey,observed,matches:matches(observed,input.content),receipt:undefined,attributable:false,resubmitSafe:false};}};
}
