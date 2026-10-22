import {ChatProviderError,retryAfter,type ChatNotifier} from './slack';

/** Normalized notification capability, including the landed NOOK-080 HTTP adapter. */
export interface NookAudienceFacts {
 channel:string;private:boolean;shared:boolean;archived:boolean;revoked:boolean;
 rosterComplete:boolean;membershipManagedByMembers:boolean;appId:string;
 members:{email:string;verified:boolean;guest:boolean;external:boolean;bot:boolean;appId?:string}[];
}
export interface NookNotificationDoor {
 audience(token:string,channel:string):Promise<Response>;
 post(token:string,input:{channel:string;text:string;clientKey:string;thread?:string}):Promise<Response>;
 editOwn(token:string,input:{channel:string;receipt:string;text:string}):Promise<Response>;
 find(token:string,input:{channel:string;clientKey:string}):Promise<Response>;
}
/** Token custody belongs to Slate; channel scope, replay and edit ownership belong to Nook. */
export function nookNotifier(door?:NookNotificationDoor):ChatNotifier {
 const required=()=>{if(!door)throw new ChatProviderError('nook_080_door_unavailable');return door;};
 async function call<T>(request:()=>Promise<Response>,writing=false):Promise<T>{
  let response:Response;try{response=await request();}catch(error){if(error instanceof ChatProviderError)throw error;throw new ChatProviderError('transport_failure',!writing,writing);}
  if(response.status===429)throw new ChatProviderError('rate_limited',true,false,false,retryAfter(response));
  if(response.status===401||response.status===403||response.status===404)throw new ChatProviderError('authorization_revoked',false,false,true);
  if(response.status>=500)throw new ChatProviderError('provider_unavailable',!writing,writing);
  if(!response.ok)throw new ChatProviderError(`provider_http_${response.status}`);
  if(response.status===204)return undefined as T;
  try{return await response.json() as T;}catch{throw new ChatProviderError('invalid_provider_response',false,writing);}
 }
 return {
  async audience(token,channel){
   const facts=await call<NookAudienceFacts>(()=>required().audience(token,channel));
   if(facts.channel!==channel||facts.private!==true||facts.shared!==false||facts.archived!==false||facts.revoked!==false||facts.rosterComplete!==true||facts.membershipManagedByMembers!==true)throw new ChatProviderError('private_unshared_channel_required');
   if(!facts.appId||!Array.isArray(facts.members))throw new ChatProviderError('unverifiable_audience');
   const emails:string[]=[];
   for(const member of facts.members){
    if(member.bot===true&&member.appId===facts.appId)continue;
    if(member.bot!==false||member.guest!==false||member.external!==false||member.verified!==true||typeof member.email!=='string'||!member.email.trim())throw new ChatProviderError('unverifiable_audience');
    emails.push(member.email.toLowerCase());
   }
   if(!emails.length)throw new ChatProviderError('empty_audience');
   return {emails,teamId:channel};
  },
  async send(token,channel,text,clientKey,thread){const result=await call<{receipt:string}>(()=>required().post(token,{channel,text,clientKey,...(thread?{thread}:{})}),true);if(typeof result.receipt!=='string'||!result.receipt)throw new ChatProviderError('missing_receipt',false,true);return result.receipt;},
  edit:(token,channel,receipt,text)=>call<void>(()=>required().editOwn(token,{channel,receipt,text}),true),
  async findReceipt(token,channel,clientKey){const result=await call<{receipt:string|null}>(()=>required().find(token,{channel,clientKey}));if(result.receipt!==null&&typeof result.receipt!=='string')throw new ChatProviderError('invalid_provider_response');return result.receipt;},
 };
}
