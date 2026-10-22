import {env} from 'cloudflare:test';
import {expect,vi} from 'vitest';
import {nookHttpDoor} from '../../../src/core/features/notifications/nook-http';
import {nookNotifier} from '../../../src/core/features/notifications/nook';

/** Recorded NOOK-080 HTTP shapes from Nook main c527acae, exercised through Slate's routes. */
export async function landedNookHttpJourney(h:any){
 h.edge.restore();
 const token=h.tokens[2],channel=h.channels[2],origin='https://nook.synthetic-slate.test';
 const human={id:'synthetic-slate-1',name:'synthetic-slate-1',verifiedEmail:h.readerEmail,emailVerified:true,guest:false,bot:false};
 let facts:any={channel,private:true,archived:false,sharing:{state:'local',federationAvailable:false},members:[human]};
 let revoked=false,rateLimited=false,uncertain=false;
 const messages=new Map<string,{id:string;body:string;version:number;key:string;author:string}>();
 const calls:{path:string;method:string}[]=[];
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async(input:any,init?:RequestInit)=>{
  const request=new Request(input,init),url=new URL(request.url);expect(url.origin).toBe(origin);
  const path=url.pathname,method=request.method;calls.push({path,method});
  expect(request.redirect).toBe('manual');expect(request.headers.get('authorization')).toBe(`Bearer ${token}`);
  if(revoked||!path.startsWith('/api/notification-destinations/'+channel+'/'))return Response.json({error:'Destination unavailable'},{status:404});
  if(path.endsWith('/audience'))return Response.json(facts);
  const body=await request.json() as any;
  if(method==='POST'){
   expect(Object.keys(body)).toEqual(['body']);expect(body.body).not.toContain('synthetic-slate-private-body');
   const key=request.headers.get('Idempotency-Key')!;expect(key).toMatch(/^[A-Za-z0-9._:-]{1,64}$/);
   if(rateLimited){rateLimited=false;return new Response(null,{status:429,headers:{'Retry-After':'2'}});}
   const prior=[...messages.values()].find(m=>m.key===key);
   if(prior)return prior.body===body.body?Response.json({...prior,conversation:channel}):new Response(null,{status:409});
   const message={id:'synthetic-slate-'+(messages.size+10),body:body.body,version:1,key,author:'synthetic-slate-approval'};messages.set(message.id,message);
   return uncertain?new Response(null,{status:503}):Response.json({...message,conversation:channel});
  }
  expect(method).toBe('PATCH');expect(Object.keys(body).sort()).toEqual(['body','version']);
  const message=messages.get(decodeURIComponent(path.split('/').at(-1)!));
  if(!message||message.author!=='synthetic-slate-approval')return new Response(null,{status:404});
  if(message.version!==body.version)return new Response(null,{status:409});
  message.body=body.body;message.version++;return Response.json({...message,conversation:channel});
 });
 try{
  // Before normalization the same raw provider audience is refused, with no credential stored.
  h.bindings.NOOK_NOTIFIER={...h.bindings.NOOK_NOTIFIER,audience:async()=>Response.json(facts)};
  expect((await h.raw('POST','/api/notifications/chat/destinations',{operationKey:h.key(),provider:'nook',channel,token,events:['comment']})).status).toBe(422);
  expect(await env.DB.prepare("SELECT count(*) n FROM chat_connections WHERE COALESCE(notifier_provider,provider)='nook'").first('n')).toBe(0);
  h.bindings.NOOK_NOTIFIER=undefined;h.bindings.NOOK_NOTIFICATION_ORIGIN=origin;
  // Unknown guest, mailbox verification, sharing and bot facts all refuse at the public connection door.
  const good=facts;
  for(const bad of [
   {...good,sharing:{state:'unknown',federationAvailable:false}},
   {...good,sharing:{state:'shared',federationAvailable:false}},
   {...good,members:[{...human,guest:'unknown'}]},
   {...good,members:[{...human,emailVerified:'unknown'}]},
   {...good,members:[{...human,verifiedEmail:null}]},
   {...good,members:[human,{id:'synthetic-slate-other-bot',bot:true,guest:false,emailVerified:true,verifiedEmail:h.readerEmail}]},
  ]){
   facts=bad;expect((await h.raw('POST','/api/notifications/chat/destinations',{operationKey:h.key(),provider:'nook',channel,token,events:['comment']})).status).toBe(422);
  }
  facts=good;const id=await h.connect('nook',token,channel);
  const page=await h.page('synthetic-slate-landed-nook');await h.comment(page);await h.sweep();expect(messages.size).toBe(1);
  const message=[...messages.values()][0]!;expect(message.body).toContain('synthetic-slate-landed-nook');
  await h.purge(page);await h.sweep();expect(message.body).toBe('Restricted Slate page');expect(message.version).toBe(2);
  const adapter=nookNotifier(nookHttpDoor(origin));const before=calls.length;
  await expect(adapter.send(token,channel,'synthetic-slate-1','synthetic-slate-2','synthetic-slate-parent')).rejects.toMatchObject({code:'nook_threads_unavailable'});
  expect(calls.length).toBe(before);expect(await adapter.findReceipt(token,channel,'synthetic-slate-2',new Date().toISOString())).toBeNull();expect(calls.length).toBe(before);
  await expect(adapter.audience(token,'synthetic-slate-channel-other')).rejects.toMatchObject({auth:true});
  rateLimited=true;await expect(adapter.send(token,channel,'synthetic-slate-rate','synthetic-slate-3')).rejects.toMatchObject({transient:true,retryAfterMs:2000});
  const receipt=await adapter.send(token,channel,'synthetic-slate-replay','synthetic-slate-4');expect(await adapter.send(token,channel,'synthetic-slate-replay','synthetic-slate-4')).toBe(receipt);
  await expect(adapter.send(token,channel,'synthetic-slate-changed','synthetic-slate-4')).rejects.toMatchObject({code:'provider_http_409'});
  await adapter.edit(token,channel,receipt,'synthetic-slate-edit');await expect(adapter.edit(token,channel,receipt,'synthetic-slate-stale')).rejects.toMatchObject({code:'provider_http_409'});
  const parsed=JSON.parse(receipt);messages.get(parsed.id)!.author='synthetic-slate-other-approval';await expect(adapter.edit(token,channel,JSON.stringify({...parsed,version:2}),'synthetic-slate-foreign')).rejects.toMatchObject({auth:true});
  uncertain=true;await expect(adapter.send(token,channel,'synthetic-slate-uncertain','synthetic-slate-5')).rejects.toMatchObject({uncertain:true});uncertain=false;
  // Actual landed HTTP door: lost acceptance response is held through acknowledgment, purge and reconnect.
  const heldPage=await h.page('synthetic-slate-held-nook');uncertain=true;await h.comment(heldPage);await h.sweep();uncertain=false;
  const heldCount=messages.size,heldHistory=(await h.api('GET',`/api/notifications/chat/destinations/${id}/deliveries`)).items;
  const held=heldHistory.find((item:any)=>item.state==='uncertain'&&!item.acknowledgedAt);expect(held).toBeTruthy();
  expect((await h.destination(id)).heldCount).toBe(1);
  const acknowledge=`/api/notifications/chat/destinations/${id}/deliveries/${held.id}/acknowledge`;
  const resolution=await h.api('POST',acknowledge,{operationKey:h.key(),expectedRevisionId:(await h.destination(id)).revisionId});
  expect(resolution.value).toMatchObject({state:'uncertain'});expect(resolution.value.acknowledgedAt).toBeTruthy();
  expect((await h.destination(id)).heldCount).toBe(0);
  await h.purge(heldPage);await h.sweep();await h.update(id,token,channel);await h.sweep();
  expect(messages.size).toBe(heldCount);
  expect((await h.api('GET',`/api/notifications/chat/destinations/${id}/deliveries`)).items.find((item:any)=>item.id===held.id)).toMatchObject({state:'uncertain',acknowledgedAt:resolution.value.acknowledgedAt});
  expect(await env.DB.prepare('SELECT count(*) n FROM chat_messages WHERE id=(SELECT message_id FROM chat_deliveries WHERE id=?)').bind(held.id).first('n')).toBe(1);
  revoked=true;const size=messages.size;const next=await h.page('synthetic-slate-after-revoke');await h.comment(next);await h.sweep();await h.sweep();
  expect(messages.size).toBe(size);expect((await h.destination(id)).state).toBe('needs-attention');
  expect(calls.every(c=>!c.path.includes('find'))).toBe(true);
 }finally{fetcher.mockRestore();}
}
