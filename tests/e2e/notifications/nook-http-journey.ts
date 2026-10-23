import {env} from 'cloudflare:test';
import {expect} from 'vitest';
import {nookHttpDoor} from '../../../src/core/features/notifications/nook-http';
import {nookNotifier} from '../../../src/core/features/notifications/nook';
import {nookHttpNetwork} from '../helpers/nook-http-network';

/** Recorded NOOK-080/089 wire shapes from Nook main 7dd6d142, through Slate's routes and queue. */
export async function landedNookHttpJourney(h:any){
 h.edge.restore();
 const token=h.tokens[2],replacement=h.tokens[4],channel=h.channels[2],origin='https://nook.synthetic-slate.test';
 const edge=nookHttpNetwork(origin,channel,token,replacement,h.readerEmail),{messages,calls,human}=edge;
 const posts=()=>calls.filter(call=>call.method==='POST').length;
 try{
  // Raw wire facts are not normalized capability facts and must refuse before custody.
  h.bindings.NOOK_NOTIFIER={...h.bindings.NOOK_NOTIFIER,audience:async()=>Response.json(edge.facts)};
  expect((await h.raw('POST','/api/notifications/chat/destinations',{operationKey:h.key(),provider:'nook',channel,token,events:['comment']})).status).toBe(422);
  expect(await env.DB.prepare("SELECT count(*) n FROM chat_connections WHERE COALESCE(notifier_provider,provider)='nook'").first('n')).toBe(0);
  h.bindings.NOOK_NOTIFIER=undefined;h.bindings.NOOK_NOTIFICATION_ORIGIN=origin;
  const good=edge.facts;
  for(const bad of [
   {...good,sharing:{state:'unknown',federationAvailable:false}},
   {...good,sharing:{state:'shared',federationAvailable:false}},
   {...good,members:[{...human,guest:'unknown'}]},
   {...good,members:[{...human,emailVerified:'unknown'}]},
   {...good,members:[{...human,verifiedEmail:null}]},
   {...good,members:[human,{id:'synthetic-slate-other-bot',bot:true,guest:false,emailVerified:true,verifiedEmail:h.readerEmail}]},
  ]){edge.facts=bad;expect((await h.raw('POST','/api/notifications/chat/destinations',{operationKey:h.key(),provider:'nook',channel,token,events:['comment']})).status).toBe(422);}
  edge.facts=good;const id=await h.connect('nook',token,channel);
  const page=await h.page('synthetic-slate-landed-nook');await h.comment(page);await h.sweep();expect(messages.size).toBe(1);
  const root=[...messages.values()][0]!;expect(root.body).toContain('synthetic-slate-landed-nook');
  await h.comment(page);await h.sweep();expect([...messages.values()].at(-1)!.thread).toBe(root.id);
  await env.DB.prepare("UPDATE chat_messages SET created_at=? WHERE connection_id=? AND thread_receipt IS NULL").bind(new Date(Date.now()-25*3600000).toISOString(),id).run();
  await h.comment(page);await h.sweep();expect([...messages.values()].at(-1)!.thread).toBeUndefined();
  const adapter=nookNotifier(nookHttpDoor(origin));
  await expect(adapter.audience(token,'synthetic-slate-channel-other')).rejects.toMatchObject({auth:true});
  edge.rateLimited=true;await expect(adapter.send(token,channel,'synthetic-slate-rate','synthetic-slate-3')).rejects.toMatchObject({transient:true,retryAfterMs:2000});
  const receipt=await adapter.send(token,channel,'synthetic-slate-replay','synthetic-slate-4'),count=messages.size;
  expect(await adapter.send(token,channel,'synthetic-slate-replay','synthetic-slate-4')).toBe(receipt);expect(messages.size).toBe(count);
  expect(await adapter.findReceipt(token,channel,'synthetic-slate-4',new Date().toISOString())).toBe(receipt);
  await expect(adapter.send(token,channel,'synthetic-slate-changed','synthetic-slate-4')).rejects.toMatchObject({code:'provider_http_409'});
  await expect(adapter.send(token,channel,'synthetic-slate-replay','synthetic-slate-4',JSON.stringify({channel,id:root.id,version:1}))).rejects.toMatchObject({code:'provider_http_409'});
  await expect(adapter.send(token,channel,'synthetic-slate-missing','synthetic-slate-6',JSON.stringify({channel,id:'synthetic-slate-missing',version:1}))).rejects.toMatchObject({code:'provider_http_400'});
  expect(await adapter.findReceipt(token,channel,'synthetic-slate-never',new Date().toISOString())).toBeNull();
  edge.tombstones.add('Slate:'+channel+':synthetic-slate-erased');expect(await adapter.findReceipt(token,channel,'synthetic-slate-erased',new Date().toISOString())).toBeNull();
  edge.malformedReceipt=true;await expect(adapter.findReceipt(token,channel,'synthetic-slate-4',new Date().toISOString())).rejects.toMatchObject({code:'invalid_provider_response'});edge.malformedReceipt=false;
  expect(await adapter.findReceipt('synthetic-slate-206',channel,'synthetic-slate-4',new Date().toISOString())).toBeNull();
  expect(await adapter.findReceipt('synthetic-slate-207','synthetic-slate-other-channel','synthetic-slate-4',new Date().toISOString())).toBeNull();expect(messages.size).toBe(count);
  await adapter.edit(token,channel,receipt,'synthetic-slate-edit');await expect(adapter.edit(token,channel,receipt,'synthetic-slate-stale')).rejects.toMatchObject({code:'provider_http_409'});
  expect(await adapter.send(token,channel,'synthetic-slate-replay','synthetic-slate-4')).toBe(receipt);
  await expect(adapter.edit('synthetic-slate-206',channel,receipt,'synthetic-slate-foreign')).rejects.toMatchObject({auth:true});
  const parsed=JSON.parse(receipt);await expect(adapter.edit('synthetic-slate-207','synthetic-slate-other-channel',JSON.stringify({...parsed,channel:'synthetic-slate-other-channel'}),'synthetic-slate-foreign')).rejects.toMatchObject({auth:true});
  await expect(adapter.edit(token,channel,JSON.stringify({...parsed,channel:'synthetic-slate-other-channel'}),'synthetic-slate-wrong-channel')).rejects.toMatchObject({code:'invalid_nook_receipt'});
  await h.purge(page);await h.sweep();
  for(const message of [...messages.values()].filter(message=>message.id===root.id||message.thread===root.id||message.body.includes('synthetic-slate-landed-nook'))){expect(message.body).toBe('Restricted Slate page');expect(message.version).toBe(2);}

  // A lost acceptance response stays held while lookup is unavailable, then resolves read-only.
  const heldPage=await h.page('synthetic-slate-held-nook');edge.uncertain=true;edge.lookupFailed=true;await h.comment(heldPage);await h.sweep();edge.uncertain=false;
  const history=(await h.api('GET',`/api/notifications/chat/destinations/${id}/deliveries`)).items;
  const held=history.find((item:any)=>item.state==='uncertain'&&!item.acknowledgedAt);expect(held).toBeTruthy();expect((await h.destination(id)).heldCount).toBe(1);
  const acceptedCount=messages.size,postCount=posts();edge.lookupFailed=false;await h.sweep();await h.sweep();
  expect(messages.size).toBe(acceptedCount);expect(posts()).toBe(postCount);expect((await h.destination(id)).heldCount).toBe(0);
  expect((await h.api('GET',`/api/notifications/chat/destinations/${id}/deliveries`)).items.find((item:any)=>item.id===held.id)).toMatchObject({state:'delivered',acknowledgedAt:null});
  const accepted=[...messages.values()].find(message=>message.body.includes('synthetic-slate-held-nook'))!;
  const acceptedReceipt=JSON.stringify({channel,...accepted.receipt});
  edge.revoked.add(token);expect((await h.update(id,replacement,channel)).status).toBe(200);
  expect(await adapter.findReceipt(replacement,channel,[...edge.intents.entries()].find(([,message])=>message.id===accepted.id)![0].slice(('Slate:'+channel+':').length),new Date().toISOString())).toBe(acceptedReceipt);
  await h.purge(heldPage);await h.sweep();expect(accepted.body).toBe('Restricted Slate page');expect(accepted.author).toBe('synthetic-slate-301');expect(accepted.version).toBe(2);
  await expect(adapter.findReceipt(token,channel,'synthetic-slate-4',new Date().toISOString())).rejects.toMatchObject({auth:true});

  const narrowed=await h.page('synthetic-slate-narrowed');await h.comment(narrowed);await h.sweep();
  const narrowedPost=[...messages.values()].find(message=>message.body.includes('synthetic-slate-narrowed'))!;
  const placement={containerId:h.closed,parentPageId:null,treePosition:'z'},preview=await h.api('POST',`/api/pages/${narrowed}/move-preview`,placement),document=await h.api('GET',`/api/pages/${narrowed}`);
  await h.api('POST',`/api/pages/${narrowed}/move`,{...placement,operationKey:h.key(),expectedRevisionId:document.page.revisionId,accessPreviewHash:preview.accessPreviewHash});await h.sweep();expect(narrowedPost.body).toBe('Restricted Slate page');
  // Keep the remote audience unchanged and authorized; this withdrawal is actor erasure.
  edge.facts={...good,members:[{...human,verifiedEmail:h.ownerEmail}]};
  const erased=await h.page('synthetic-slate-actor-erased');await h.commentByReader(erased);await h.sweep();
  const erasedPost=[...messages.values()].find(message=>message.body.includes('synthetic-slate-actor-erased'))!;
  await h.api('POST','/api/members/remove',{operationKey:h.key(),memberId:h.reader,erase:true});await h.sweep();expect(erasedPost.body).toBe('Restricted Slate page');

  // A door which still cannot answer preserves the owner acknowledgment and unresolved withdrawal.
  const unresolvedPage=await h.page('synthetic-slate-unresolved');edge.uncertain=true;edge.lookupFailed=true;await h.comment(unresolvedPage);await h.sweep();edge.uncertain=false;
  const unresolved=(await h.api('GET',`/api/notifications/chat/destinations/${id}/deliveries`)).items.find((item:any)=>item.state==='uncertain');expect(unresolved).toBeTruthy();
  const resolution=await h.api('POST',`/api/notifications/chat/destinations/${id}/deliveries/${unresolved.id}/acknowledge`,{operationKey:h.key(),expectedRevisionId:(await h.destination(id)).revisionId});expect(resolution.value).toMatchObject({state:'uncertain'});expect(resolution.value.acknowledgedAt).toBeTruthy();
  const unresolvedCount=messages.size,unresolvedPosts=posts();await h.purge(unresolvedPage);await h.sweep();expect(messages.size).toBe(unresolvedCount);expect(posts()).toBe(unresolvedPosts);
  expect(await env.DB.prepare('SELECT state,provider_receipt FROM chat_messages WHERE id=(SELECT message_id FROM chat_deliveries WHERE id=?)').bind(unresolved.id).first()).toEqual({state:'withdraw',provider_receipt:null});
  expect((await h.destination(id)).heldCount).toBe(0);
  edge.revoked.add(replacement);const next=await h.page('synthetic-slate-after-revoke');await h.comment(next);await h.sweep();expect(messages.size).toBe(unresolvedCount);expect((await h.destination(id)).state).toBe('needs-attention');
  console.log('PASS CHAT-001 nook-http-journey: NOOK-089 threads, same-key receipts without repost, replacement-approval deletion/narrowing/erasure edits and held uncertainty');
 }finally{edge.restore();}
}
