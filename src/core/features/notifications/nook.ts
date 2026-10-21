import {ChatProviderError,type ChatNotifier} from './slack';

/** Capability boundary required from NOOK-080. This is not a claimed Nook HTTP API.
 * The deployment supplies its channel-scoped door when NOOK-080 ships. */
export interface NookNotificationDoor {
 audience(token:string,channel:string):Promise<{
  channel:string;private:boolean;shared:boolean;archived:boolean;revoked:boolean;
  rosterComplete:boolean;membershipManagedByMembers:boolean;appId:string;
  members:{email:string;verified:boolean;guest:boolean;external:boolean;bot:boolean;appId?:string}[];
 }>;
 post(token:string,input:{channel:string;text:string;clientKey:string;thread?:string}):Promise<string>;
 editOwn(token:string,input:{channel:string;receipt:string;text:string}):Promise<void>;
 find(token:string,input:{channel:string;clientKey:string}):Promise<string|null>;
}
/** Token custody belongs to Slate; channel scope, replay and edit ownership belong to Nook. */
export function nookNotifier(door?:NookNotificationDoor):ChatNotifier {
 const required=()=>{if(!door)throw new ChatProviderError('nook_080_door_unavailable');return door;};
 return {
  async audience(token,channel){
   const facts=await required().audience(token,channel);
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
  send:(token,channel,text,clientKey,thread)=>required().post(token,{channel,text,clientKey,...(thread?{thread}:{})}),
  edit:(token,channel,receipt,text)=>required().editOwn(token,{channel,receipt,text}),
  findReceipt:(token,channel,clientKey)=>required().find(token,{channel,clientKey}),
 };
}
