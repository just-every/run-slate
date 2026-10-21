import { ChatProviderError, type ChatNotifier } from './slack';

/** chat.notifier.v1: delegated Microsoft Graph channel messages, never a webhook. */
export function teamsNotifier(fetcher:typeof fetch=fetch):ChatNotifier {
 const origin='https://graph.microsoft.com';
 const base=(destination:string)=>{const [team,channel,...rest]=destination.split('/');if(!team||!channel||rest.length)throw new ChatProviderError('invalid_destination');return `/v1.0/teams/${encodeURIComponent(team)}/channels/${encodeURIComponent(channel)}`;};
 async function call(token:string,path:string,body?:unknown,key?:string):Promise<Record<string,any>> {
  const writing=body!==undefined;
  let response:Response;
  try {response=await fetcher(origin+path,{method:writing?'POST':'GET',headers:{authorization:`Bearer ${token}`,...(writing?{'content-type':'application/json','client-request-id':key!}:{})},...(writing?{body:JSON.stringify(body)}:{}),redirect:'manual',signal:AbortSignal.timeout(15000)});}
  catch {throw new ChatProviderError('transport_failure',!writing,writing);}
  if(response.status===429)throw new ChatProviderError('rate_limited',true);
  if(response.status===401||response.status===403)throw new ChatProviderError('authorization_revoked',false,false,true);
  if(response.status>=500)throw new ChatProviderError('provider_unavailable',!writing,writing);
  if(!response.ok)throw new ChatProviderError(`provider_http_${response.status}`);
  try{return await response.json() as Record<string,any>;}catch{throw new ChatProviderError('invalid_provider_response',false,writing);}
 }
 return {
  async audience(token,destination){
   const path=base(destination),room=await call(token,path),team=destination.split('/')[0]!;
   // Standard channels inherit the team; private channels have their own roster.
   // Graph allMembers includes direct and indirect shared-channel members.
   const membersPath=room.membershipType==='standard'?`/v1.0/teams/${encodeURIComponent(team)}/members`:room.membershipType==='private'?path+'/members':room.membershipType==='shared'?path+'/allMembers':null;
   if(!membersPath)throw new ChatProviderError('unverifiable_audience');
   const emails=new Set<string>(),visited=new Set<string>();let next:string|null=membersPath;
   while(next){
    if(visited.has(next))throw new ChatProviderError('invalid_audience_pagination');visited.add(next);
    const result=await call(token,next);
    if(!Array.isArray(result.value))throw new ChatProviderError('unverifiable_audience');
    for(const member of result.value){
     if(member['@odata.type']!=='#microsoft.graph.aadUserConversationMember'||typeof member.email!=='string'||!member.email.trim())throw new ChatProviderError('unverifiable_audience');
     emails.add(member.email.toLowerCase());
    }
    if(emails.size>10000)throw new ChatProviderError('audience_too_large');
    const link=result['@odata.nextLink'];next=null;
    if(link!==undefined){
     if(typeof link!=='string')throw new ChatProviderError('invalid_audience_pagination');
     const url=new URL(link);
     if(url.origin!==origin||url.pathname!==membersPath||url.username||url.password||url.hash)throw new ChatProviderError('invalid_audience_pagination');
     next=url.pathname+url.search;
    }
   }
   if(!emails.size)throw new ChatProviderError('empty_audience');
   return {emails:[...emails],teamId:team};
  },
  async send(token,destination,text,key){
   const result=await call(token,base(destination)+'/messages',{body:{contentType:'text',content:text}},key);
   if(typeof result.id!=='string')throw new ChatProviderError('missing_receipt',false,true);
   return JSON.stringify({channel:destination,id:result.id});
  },
  // Graph's client-request-id is correlation, not an idempotency guarantee.
  // An uncertain write is retained for review and never blindly resubmitted.
  async findReceipt(){return null;},
 };
}
