import type {NookNotificationDoor,NookAudienceFacts} from './nook';
import {ChatProviderError} from './slack';

type Member={id?:unknown;verifiedEmail?:unknown;emailVerified?:unknown;guest?:unknown;bot?:unknown};
type Audience={channel?:unknown;private?:unknown;archived?:unknown;sharing?:{state?:unknown;federationAvailable?:unknown};members?:Member[]};
const sender='authenticated-nook-approval';
/** NOOK-080/089 HTTP wire contract; the origin is deployment configuration, never a request input. */
export function nookHttpDoor(origin:string,fetcher:typeof fetch=fetch):NookNotificationDoor {
 let base:URL;try{base=new URL(origin);}catch{throw new ChatProviderError('invalid_nook_origin');}
 if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw new ChatProviderError('invalid_nook_origin');
 const readReceipt=(channel:string,value:unknown,writing=false)=>{
  const receipt=value as {id?:unknown;version?:unknown;acceptedAt?:unknown}|null;
  if(!receipt||typeof receipt.id!=='string'||!receipt.id||!Number.isInteger(receipt.version)||Number(receipt.version)<1||typeof receipt.acceptedAt!=='string'||!Number.isFinite(Date.parse(receipt.acceptedAt)))throw new ChatProviderError('invalid_provider_response',false,writing);
  return JSON.stringify({channel,id:receipt.id,version:receipt.version,acceptedAt:receipt.acceptedAt});
 };
 const storedReceipt=(channel:string,value:string)=>{
  let receipt:{channel?:string;id?:string;version?:number};try{receipt=JSON.parse(value);}catch{throw new ChatProviderError('invalid_nook_receipt');}
  if(!receipt||receipt.channel!==channel||typeof receipt.id!=='string'||!receipt.id||!Number.isInteger(receipt.version)||Number(receipt.version)<1)throw new ChatProviderError('invalid_nook_receipt');
  return {channel,id:receipt.id,version:Number(receipt.version)};
 };
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
   const thread=input.thread?storedReceipt(input.channel,input.thread).id:undefined;
   const response=await call(token,path(input.channel)+'/messages','POST',{body:input.text,...(thread?{thread}:{})},input.clientKey);if(!response.ok)return response;
   const value=await response.json() as {id?:unknown;conversation?:unknown;receipt?:unknown};
   const receipt=readReceipt(input.channel,value.receipt,true);
   if(value.conversation!==input.channel||value.id!==JSON.parse(receipt).id)throw new ChatProviderError('invalid_provider_response',false,true);
   return Response.json({receipt});
  },
  async editOwn(token,input){
   const receipt=storedReceipt(input.channel,input.receipt);
   const response=await call(token,path(input.channel)+'/messages/'+encodeURIComponent(receipt.id),'PATCH',{body:input.text,version:receipt.version});
   return response.ok?new Response(null,{status:204}):response;
  },
  // Receipt lookup is read-only. Missing/tombstoned intent never authorizes a resend.
  async find(token,input){
   const response=await call(token,path(input.channel)+'/client-keys/'+encodeURIComponent(input.clientKey));if(!response.ok)return response;
   const value=await response.json() as {accepted?:unknown;receipt?:unknown};
   if(value.accepted===true)return Response.json({receipt:readReceipt(input.channel,value.receipt)});
   if(value.accepted!==false)throw new ChatProviderError('invalid_provider_response');
   return Response.json({receipt:null});
  },
 };
}
export function configuredNookDoor(env:{NOOK_NOTIFIER?:NookNotificationDoor;NOOK_NOTIFICATION_ORIGIN?:string}):NookNotificationDoor|undefined {
 return env.NOOK_NOTIFIER??(env.NOOK_NOTIFICATION_ORIGIN?nookHttpDoor(env.NOOK_NOTIFICATION_ORIGIN):undefined);
}
