import { expect } from 'vitest';
import type { SlackAudienceFixture } from './slack-network';

/** Slack and Graph HTTP edges only: all application/storage/authorization code runs unchanged. */
export function chatNetwork(tokens:string[],email:string) {
 const original=globalThis.fetch;
 const messages:{token:string;provider:string;channel:string;text:string;key:string;receipt:string;thread?:string}[]=[];
 const attempts:{token:string;key:string;status:number}[]=[];
 const failures=new Map<string,string>();
 const audiences=new Map<string,SlackAudienceFixture>();
 const rosters=new Map<string,string[]>(),users=new Map<string,string>();
 const audienceCalls:{token:string;channel:string}[]=[];
 const teamsApps=new Map<string,unknown[]>();
 const teamsRooms=new Map<string,Record<string,unknown>>();
 const teamsMembers=new Map<string,unknown[]>();
 let duringAudience:(()=>Promise<void>)|undefined;
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url);
  if(!['https://slack.com','https://graph.microsoft.com'].includes(url.origin))return original(input,init);
  const token=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';
  expect(tokens).toContain(token);
  const failure=failures.get(token),teams=url.hostname==='graph.microsoft.com';
  if(failure==='revoked'||failure==='expired')return teams?new Response('',{status:401}):Response.json({ok:false,error:failure==='revoked'?'token_revoked':'token_expired'});
  const editing=request.method==='PATCH'||url.pathname.endsWith('/chat.update');
  const writing=request.method==='POST'||request.method==='PATCH',body=writing?await request.json<any>():Object.fromEntries(url.searchParams);
  if(editing){const receipt=teams?decodeURIComponent(url.pathname.split('/').at(-1)!):body.ts;const channel=teams?decodeURIComponent(url.pathname.split('/channels/')[1]!.split('/')[0]!):body.channel;const message=messages.find(m=>m.token===token&&m.receipt===receipt&&m.channel===channel);expect(message).toBeTruthy();message!.text=teams?body.body.content:body.text;return Response.json(teams?{}:{ok:true});}
  if(writing){
   const key=teams?request.headers.get('client-request-id')!:body.client_msg_id;
   expect(key).toMatch(/^[a-f0-9-]{36}$/);
   const status=failure==='transient'?429:failure==='permanent'?404:failure==='uncertain'?503:200;
   attempts.push({token,key,status});
   if(status!==200){if(failure==='transient')failures.delete(token);return teams?new Response('',{status,headers:{'retry-after':'120'}}):status===404?Response.json({ok:false,error:'channel_not_found'}):new Response('',{status,headers:{'retry-after':'120'}});}
   const text=teams?body.body.content:body.text;
   if(teams){expect(Object.keys(body)).toEqual(['body']);expect(body.body.contentType).toBe('text');}
   else {expect(body.unfurl_links).toBe(false);expect(body.unfurl_media).toBe(false);expect(body.mrkdwn).toBe(false);}
   messages.push({token,provider:teams?'teams':'slack',channel:teams?decodeURIComponent(url.pathname.split('/channels/')[1]!.split('/')[0]!):body.channel,text,key,receipt:String(messages.length+1),thread:teams?(url.pathname.endsWith('/replies')?url.pathname.split('/').at(-2):undefined):body.thread_ts});
   return Response.json(teams?{id:String(messages.length)}:{ok:true,ts:String(messages.length)});
  }
  if(teams){
   if(url.pathname==='/v1.0/organization')return Response.json({value:[{id:'synthetic-slate-tenant'}]});
   if(url.pathname.includes('/users/')){const id=decodeURIComponent(url.pathname.split('/users/')[1]!);return Response.json({id,mail:users.get(id)??email,userType:'Member',accountEnabled:true,externalUserState:null});}
   if(url.pathname.endsWith('/installedApps'))return Response.json({value:teamsApps.get(token)??[]});
   if(url.pathname.endsWith('/members')||url.pathname.endsWith('/allMembers')){
    const callback=duringAudience;duringAudience=undefined;await callback?.();
    const channel=decodeURIComponent(url.pathname.split('/teams/')[1]!.split('/')[0]!)+'/'+decodeURIComponent(url.pathname.split('/channels/')[1]?.split('/')[0]??'');audienceCalls.push({token,channel});
    const roster=rosters.get(token+':'+channel);if(roster)return Response.json({value:roster.map(mail=>{const id='synthetic-slate-user-'+mail;users.set(id,mail);return {'@odata.type':'#microsoft.graph.aadUserConversationMember',email:mail,userId:id,tenantId:'synthetic-slate-tenant',roles:[]};})});
    return Response.json({value:teamsMembers.get(token)??[{'@odata.type':'#microsoft.graph.aadUserConversationMember',email,userId:'synthetic-slate-reader',tenantId:'synthetic-slate-tenant',roles:[]}]});
   }
   return Response.json({membershipType:'private',visibility:'private',...teamsRooms.get(token)});
  }
  const fixture=audiences.get(token)??{};
  switch(url.pathname.split('/').at(-1)){
   case 'auth.test':return Response.json({ok:true,user_id:'SENDER',team_id:'synthetic-slate-10',user:'synthetic-slate-11'});
   case 'conversations.info':return Response.json({ok:true,channel:{is_private:true,is_ext_shared:false,is_org_shared:false,...fixture.channel}});
   case 'conversations.list':return Response.json({ok:true,channels:[{id:'GSLATE4',name:'synthetic-slate-4',is_member:true,is_private:true}],response_metadata:{}},{headers:{'x-oauth-scopes':'chat:write,groups:read,groups:history,users:read,users:read.email'}});
   case 'conversations.members':{
    const callback=duringAudience;duringAudience=undefined;await callback?.();
    const channel=String(body.channel);audienceCalls.push({token,channel});const roster=rosters.get(token+':'+channel);if(roster)return Response.json({ok:true,members:['SENDER',...roster.map(mail=>{const id='synthetic-slate-user-'+mail;users.set(id,mail);return id;})]});
    return Response.json({ok:true,members:['SENDER',...Object.keys(fixture.users??{READER:{}})]});
   }
   case 'users.info':return Response.json({ok:true,user:users.has(String(body.user))?{profile:{email:users.get(String(body.user))}}:fixture.users?fixture.users[String(body.user)]:{profile:{email}}});
   case 'conversations.history':return Response.json({ok:true,messages:[]});
   default:throw Error('Unexpected synthetic Slack request');
  }
 };
 return {messages,attempts,failures,audiences,rosters,audienceCalls,teamsMembers,teamsRooms,teamsApps,duringAudience:(callback:()=>Promise<void>)=>{duringAudience=callback;},restore:()=>{globalThis.fetch=original;}};
}
