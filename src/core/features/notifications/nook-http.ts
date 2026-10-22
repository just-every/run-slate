import type {NookNotificationDoor,NookAudienceFacts} from './nook';
import {ChatProviderError} from './slack';

type Member={id?:unknown;verifiedEmail?:unknown;emailVerified?:unknown;guest?:unknown;bot?:unknown};
type Audience={channel?:unknown;private?:unknown;archived?:unknown;sharing?:{state?:unknown;federationAvailable?:unknown};members?:Member[]};
const sender='authenticated-nook-approval';
/** NOOK-080 HTTP wire contract; the origin is deployment configuration, never a request input. */
export function nookHttpDoor(origin:string,fetcher:typeof fetch=fetch):NookNotificationDoor {
 let base:URL;try{base=new URL(origin);}catch{throw new ChatProviderError('invalid_nook_origin');}
 if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw new ChatProviderError('invalid_nook_origin');
 const path=(channel:string)=>`/api/notification-destinations/${encodeURIComponent(channel)}`;
 const call=(token:string,url:string,method='GET',body?:unknown,key?:string)=>fetcher(new URL(url,base),{method,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'}),...(key?{'Idempotency-Key':key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual',signal:AbortSignal.timeout(15000)});
 return {
  async audience(token,channel){
   const response=await call(token,path(channel)+'/audience');if(!response.ok)return response;
   const raw=await response.json() as Audience;
   if(!raw||!Array.isArray(raw.members))throw new ChatProviderError('unverifiable_audience');
   // Only the approval identity authenticated by the channel token may be excluded as our bot.
   const approval=/^nookapp_([a-zA-Z0-9-]+)\./.exec(token)?.[1];
   const facts:NookAudienceFacts={channel:typeof raw.channel==='string'?raw.channel:'',private:raw.private===true,
    shared:raw.sharing?.state!=='local'||raw.sharing?.federationAvailable!==false,archived:raw.archived!==false,
    revoked:false,rosterComplete:true,membershipManagedByMembers:true,appId:sender,
    members:raw.members.map(member=>({email:typeof member.verifiedEmail==='string'?member.verifiedEmail:'',verified:member.emailVerified===true,
     guest:member.guest!==false,external:raw.sharing?.state!=='local',bot:member.bot!==false,
     ...(member.bot===true&&approval&&member.id===approval?{appId:sender}:{})}))};
   return Response.json(facts);
  },
  async post(token,input){
   // The landed Nook door has no thread field. Never silently flatten a requested reply.
   if(input.thread)throw new ChatProviderError('nook_threads_unavailable');
   const response=await call(token,path(input.channel)+'/messages','POST',{body:input.text},input.clientKey);if(!response.ok)return response;
   const value=await response.json() as {id?:unknown;conversation?:unknown;version?:unknown};
   if(typeof value.id!=='string'||value.conversation!==input.channel||!Number.isInteger(value.version)||Number(value.version)<1)throw new ChatProviderError('invalid_provider_response',false,true);
   return Response.json({receipt:JSON.stringify({channel:input.channel,id:value.id,version:value.version})});
  },
  async editOwn(token,input){
   let receipt:{channel?:string;id?:string;version?:number};try{receipt=JSON.parse(input.receipt);}catch{throw new ChatProviderError('invalid_nook_receipt');}
   if(receipt.channel!==input.channel||typeof receipt.id!=='string'||!Number.isInteger(receipt.version)||Number(receipt.version)<1)throw new ChatProviderError('invalid_nook_receipt');
   const response=await call(token,path(input.channel)+'/messages/'+encodeURIComponent(receipt.id),'PATCH',{body:input.text,version:receipt.version});
   return response.ok?new Response(null,{status:204}):response;
  },
  // There is no lookup-by-client-key route. Uncertain sends remain held, without a blind resend.
  async find(){return Response.json({receipt:null});},
 };
}
export function configuredNookDoor(env:{NOOK_NOTIFIER?:NookNotificationDoor;NOOK_NOTIFICATION_ORIGIN?:string}):NookNotificationDoor|undefined {
 return env.NOOK_NOTIFIER??(env.NOOK_NOTIFICATION_ORIGIN?nookHttpDoor(env.NOOK_NOTIFICATION_ORIGIN):undefined);
}
