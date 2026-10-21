import { ChatProviderError,retryAfter,type ChatNotifier } from './slack';

/** Graph channel delivery. Admin app-package installation remains a separate acceptance leg. */
export function teamsNotifier(fetcher:typeof fetch=fetch):ChatNotifier {
 const origin='https://graph.microsoft.com';
 const base=(destination:string)=>{const [team,channel,...rest]=destination.split('/');if(!team||!channel||rest.length)throw new ChatProviderError('invalid_destination');return `/v1.0/teams/${encodeURIComponent(team)}/channels/${encodeURIComponent(channel)}`;};
 async function call(token:string,path:string,body?:unknown,key?:string,method=body===undefined?'GET':'POST'):Promise<Record<string,any>> {
  const writing=method!=='GET';let response:Response;
  try{response=await fetcher(origin+path,{method,headers:{authorization:`Bearer ${token}`,...(writing?{'content-type':'application/json',...(key?{'client-request-id':key}:{})}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),redirect:'manual',signal:AbortSignal.timeout(15000)});}
  catch{throw new ChatProviderError('transport_failure',!writing,writing);}
  if(response.status===429)throw new ChatProviderError('rate_limited',true,false,false,retryAfter(response));
  if(response.status===401||response.status===403)throw new ChatProviderError('authorization_revoked',false,false,true);
  if(response.status>=500)throw new ChatProviderError('provider_unavailable',!writing,writing);
  if(!response.ok)throw new ChatProviderError(`provider_http_${response.status}`);
  if(response.status===204)return {};
  try{return await response.json();}catch{throw new ChatProviderError('invalid_provider_response',false,writing);}
 }
 async function list(token:string,path:string){
  const values:any[]=[],visited=new Set<string>();let next:string|null=path;
  while(next){
   if(visited.has(next))throw new ChatProviderError('invalid_audience_pagination');visited.add(next);
   const result=await call(token,next);if(!Array.isArray(result.value))throw new ChatProviderError('unverifiable_audience');values.push(...result.value);
   if(values.length>10000)throw new ChatProviderError('audience_too_large');next=null;
   if(result['@odata.nextLink']!==undefined){
    const url=new URL(result['@odata.nextLink']);
    if(url.origin!==origin||url.pathname!==path.split('?')[0]||url.username||url.password||url.hash)throw new ChatProviderError('invalid_audience_pagination');next=url.pathname+url.search;
   }
  }
  return values;
 }
 return {
  async audience(token,destination){
   const path=base(destination),team=destination.split('/')[0]!,teamPath=`/v1.0/teams/${encodeURIComponent(team)}`;
   const room=await call(token,path),group=await call(token,teamPath);
   if(!['private','standard'].includes(room.membershipType)||(room.membershipType==='standard'&&group.visibility!=='private'))throw new ChatProviderError('private_unshared_channel_required');
   // A shared channel is refused outright; Graph's direct roster alone is insufficient.
   const organizations=await list(token,'/v1.0/organization?$select=id');
   if(organizations.length!==1||typeof organizations[0].id!=='string')throw new ChatProviderError('unverifiable_audience');
   const tenant=organizations[0].id;
   // Bots are installed apps, not necessarily conversation members. Missing app definitions fail closed.
   for(const app of await list(token,teamPath+'/installedApps?$expand=teamsAppDefinition($expand=bot)')){
    if(!app.teamsAppDefinition||app.teamsAppDefinition.bot!==null)throw new ChatProviderError('unverifiable_audience');
   }
   const members=await list(token,room.membershipType==='private'?path+'/members':teamPath+'/members');
   const emails=new Set<string>();
   for(const member of members){
    if(member['@odata.type']!=='#microsoft.graph.aadUserConversationMember'||member.tenantId!==tenant||!Array.isArray(member.roles)||member.roles.includes('guest')||typeof member.userId!=='string'||typeof member.email!=='string'||!member.email.trim())throw new ChatProviderError('unverifiable_audience');
    const user=await call(token,`/v1.0/users/${encodeURIComponent(member.userId)}?$select=id,mail,userType,accountEnabled,externalUserState`);
    if(user.id!==member.userId||user.userType!=='Member'||user.accountEnabled!==true||user.externalUserState!==null||typeof user.mail!=='string'||user.mail.toLowerCase()!==member.email.toLowerCase())throw new ChatProviderError('unverifiable_audience');
    emails.add(user.mail.toLowerCase());
   }
   if(!emails.size)throw new ChatProviderError('empty_audience');return {emails:[...emails],teamId:team};
  },
  async send(token,destination,text,key,thread){
   const parent=thread?JSON.parse(thread).id:null;
   const result=await call(token,base(destination)+'/messages'+(parent?`/${encodeURIComponent(parent)}/replies`:''),{body:{contentType:'text',content:text}},key);
   if(typeof result.id!=='string')throw new ChatProviderError('missing_receipt',false,true);
   return JSON.stringify({channel:destination,id:result.id,...(parent?{parent}:{})});
  },
  async edit(token,destination,receipt,text){
   const message=JSON.parse(receipt);
   await call(token,base(destination)+'/messages/'+(message.parent?`${encodeURIComponent(message.parent)}/replies/`:'')+encodeURIComponent(message.id),{body:{contentType:'text',content:text}},undefined,'PATCH');
  },
  // Graph's correlation key is not an idempotency guarantee: uncertain writes stay held.
  async findReceipt(){return null;},
 };
}
