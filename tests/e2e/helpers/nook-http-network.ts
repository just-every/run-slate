import {expect,vi} from 'vitest';

interface Approval {name:string;channel:string;id:string}
interface Posted {id:string;conversation:string;author:string;authorName:string;app:number;body:string;created:string;version:number;receipt:{id:string;version:number;acceptedAt:string};thread?:string}
/** Recorded NOOK-080/089 network boundary. No Slate operation is replaced. */
export function nookHttpNetwork(origin:string,channel:string,token:string,replacement:string,email:string){
 const approvals=new Map<string,Approval>([
  [token,{name:'Slate',channel,id:'synthetic-slate-301'}],
  [replacement,{name:'Slate',channel,id:'synthetic-slate-302'}],
  ['synthetic-slate-206',{name:'Another app',channel,id:'synthetic-slate-303'}],
  ['synthetic-slate-207',{name:'Slate',channel:'synthetic-slate-other-channel',id:'synthetic-slate-304'}],
 ]);
 const human={id:'synthetic-slate-1',name:'synthetic-slate-1',verifiedEmail:email,emailVerified:true,guest:false,bot:false};
 const edge={facts:{channel,private:true,archived:false,sharing:{state:'local',federationAvailable:false},members:[human]} as any,
  revoked:new Set<string>(),rateLimited:false,uncertain:false,lookupFailed:false,malformedReceipt:false,
  messages:new Map<string,Posted>(),intents:new Map<string,Posted>(),tombstones:new Set<string>(),calls:[] as {path:string;method:string;token:string}[]};
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async(input:any,init?:RequestInit)=>{
  const request=new Request(input,init),url=new URL(request.url);expect(url.origin).toBe(origin);expect(request.redirect).toBe('manual');
  const auth=request.headers.get('authorization')?.replace(/^Bearer /,''),approval=auth?approvals.get(auth):undefined;
  edge.calls.push({path:url.pathname,method:request.method,token:auth??''});
  const prefix=approval?`/api/notification-destinations/${approval.channel}/`:'';
  if(!approval||edge.revoked.has(auth!)||!url.pathname.startsWith(prefix))return Response.json({error:'Destination unavailable'},{status:404});
  const route=url.pathname.slice(prefix.length),identity=approval.name+':'+approval.channel;
  if(route==='audience')return Response.json({...edge.facts,channel:approval.channel});
  if(route.startsWith('client-keys/')){
   expect(request.method).toBe('GET');expect(await request.text()).toBe('');
   if(edge.lookupFailed)return new Response(null,{status:503});
   const intent=identity+':'+decodeURIComponent(route.slice('client-keys/'.length)),posted=edge.intents.get(intent);
   return Response.json(posted?{accepted:true,receipt:edge.malformedReceipt?{id:posted.id}:posted.receipt}:edge.tombstones.has(intent)?{accepted:false,state:'tombstone'}:{accepted:false});
  }
  const body=await request.json() as any;
  if(request.method==='POST'&&route==='messages'){
   expect(Object.keys(body).sort()).toEqual(body.thread?['body','thread']:['body']);expect(body.body).not.toContain('synthetic-slate-private-body');
   const key=request.headers.get('Idempotency-Key')!;expect(key).toMatch(/^[A-Za-z0-9._:-]{1,64}$/);
   const intent=identity+':'+key,prior=edge.intents.get(intent);
   if(prior)return prior.body===body.body&&prior.thread===body.thread?Response.json(prior):new Response(null,{status:409});
   if(edge.tombstones.has(intent))return new Response(null,{status:409});
   if(body.thread){const root=edge.messages.get(body.thread);if(!root||root.conversation!==approval.channel||root.thread)return Response.json({error:'Thread unavailable'},{status:400});}
   if(edge.rateLimited){edge.rateLimited=false;return new Response(null,{status:429,headers:{'Retry-After':'2'}});}
   const id='synthetic-slate-'+(edge.messages.size+310),created=new Date().toISOString();
   const message:Posted={id,conversation:approval.channel,author:approval.id,authorName:approval.name,app:1,body:body.body,created,version:1,receipt:{id,version:1,acceptedAt:created},...(body.thread?{thread:body.thread}:{})};
   edge.messages.set(id,message);edge.intents.set(intent,structuredClone(message));
   return edge.uncertain?new Response(null,{status:503}):Response.json(message);
  }
  expect(request.method).toBe('PATCH');expect(Object.keys(body).sort()).toEqual(['body','version']);
  const message=edge.messages.get(decodeURIComponent(route.slice('messages/'.length)));
  const author=message&&[...approvals.values()].find(item=>item.id===message.author);
  if(!message||author?.name!==approval.name||author.channel!==approval.channel)return new Response(null,{status:404});
  if(message.version!==body.version)return new Response(null,{status:409});
  message.body=body.body;message.version++;return Response.json(message);
 });
 return Object.assign(edge,{restore:()=>fetcher.mockRestore(),human});
}
