import {requireReadScopes,CodeWriteScopeError} from './scopes';
import type {CodeProvider} from './reference';
export class CodeProviderError extends Error{constructor(readonly state:'request-access'|'unavailable'|'failed'){super('The provider could not authorize this read.');}}
/** Tokens go only to the two fixed API hosts. Redirects never receive credentials. */
export async function codeRead(provider:CodeProvider,path:string,token:string,raw=false):Promise<any>{
 const origin=provider==='github'?'https://api.github.com':'https://gitlab.com';
 const url=new URL(path,origin);
 if(url.origin!==origin||!path.startsWith('/')||path.startsWith('//')||url.username||url.password)throw new CodeProviderError('failed');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
 try{
  const response=await fetch(url.href,{method:'GET',redirect:'manual',credentials:'omit',headers:{Authorization:'Bearer '+token,Accept:raw&&provider==='github'?'application/vnd.github.raw+json':'application/json'},signal:controller.signal});
  const reported=response.headers.get('x-oauth-scopes');
  if(provider==='github'&&reported!==null)try{requireReadScopes(provider,reported.split(',').map(scope=>scope.trim()).filter(Boolean));}catch(error){await response.body?.cancel();throw error;}
  const rejectResponse=async(state:CodeProviderError['state']):Promise<never>=>{await response.body?.cancel();throw new CodeProviderError(state);};
  if([401,403].includes(response.status))return rejectResponse('request-access');
  if([404,410].includes(response.status)||response.status>=300&&response.status<400)return rejectResponse('unavailable');
  if(!response.ok||Number(response.headers.get('content-length'))>512*1024)return rejectResponse('failed');
  const reader=response.body?.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let size=0,text='';
  if(!reader)throw new CodeProviderError('failed');
  try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>512*1024)throw new CodeProviderError('failed');text+=decoder.decode(next.value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();}
  return raw?text:JSON.parse(text);
 }catch(error){if(error instanceof CodeProviderError||error instanceof CodeWriteScopeError)throw error;throw new CodeProviderError('failed');}
 finally{clearTimeout(timer);}
}
const string=(v:unknown)=>typeof v==='string'&&v.length>0?v:null;
export async function codeIdentity(provider:CodeProvider,token:string,email:string){
 const user=await codeRead(provider,provider==='github'?'/user':'/api/v4/user',token);
 const emails=await codeRead(provider,provider==='github'?'/user/emails':'/api/v4/user/emails',token);
 if(provider==='gitlab'){const authority=await codeRead(provider,'/api/v4/personal_access_tokens/self',token);if(!Array.isArray(authority.scopes)||!authority.scopes.every((scope:unknown)=>typeof scope==='string'))throw new CodeProviderError('request-access');requireReadScopes(provider,authority.scopes);}
 if(!Array.isArray(emails))throw new CodeProviderError('request-access');
 const matches=emails.filter(e=>typeof e.email==='string'&&e.email.toLowerCase()===email.toLowerCase()&&(provider==='github'?e.verified===true:typeof e.confirmed_at==='string'&&!!e.confirmed_at));
 const id=typeof user.id==='number'||typeof user.id==='string'?String(user.id):null,label=string(provider==='github'?user.login:user.username);
 if(matches.length!==1||!id||!label)throw new CodeProviderError('request-access');
 return {id,label,email:matches[0].email.toLowerCase()};
}
