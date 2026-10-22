import {env,applyD1Migrations,createExecutionContext,waitOnExecutionContext} from 'cloudflare:test';
import {beforeEach,expect,vi} from 'vitest';
import {contract} from '../contract';
import {resetDeployment} from '../setup/reset-deployment';
import {seedWorkspace,seedMember,seedContainer,seedContainerGrant,sessionFor} from '../setup/fixtures';
import {createApi} from '../../../src/core/app/hono';
import worker from '../../../src/server';
import type {AppBindings} from '../../../src/core/app/types';
import {handleApplicationRequest} from '../../../src/core/app/request-handler';
import {assertStoredConfiguration} from '../../../src/core/app/runtime-gate';
import {encryptSecret,decryptSecret} from '../../../src/core/platform/secrets/custody';
import {chatScope} from '../../../src/core/features/notifications/chat-config';
import {runContentJobs} from '../../../src/core/features/lifecycle/jobs';
import {decodeArchive} from '../../../src/core/features/portability/archive';
import {chatNetwork} from '../helpers/chat-network';
import type {SlackAudienceFixture} from '../helpers/slack-network';

// This single journey now covers four destinations, upgrades and destructive withdrawal.
vi.setConfig({testTimeout:60000});
beforeEach(resetDeployment);
contract('CHAT-001','Owners connect several chat destinations, each with its own event selection, and every destination sends one link-only message, fails and disconnects on its own',async()=>{
 const {workspaceId}=await seedWorkspace();
 const owner=(await seedMember(workspaceId,{role:'owner',email:'synthetic-slate-1@example.test',displayName:'synthetic-slate-1'})).memberId;
 const reader=(await seedMember(workspaceId,{role:'member',email:'synthetic-slate-2@example.test',displayName:'synthetic-slate-2'})).memberId;
 const manager=(await seedMember(workspaceId,{role:'member',email:'synthetic-slate-3@example.test',displayName:'synthetic-slate-3'})).memberId;
 await seedMember(workspaceId,{role:'member',email:'synthetic-slate-4@example.test',displayName:'synthetic-slate-4',status:'removed'});
 const containerId=(await seedContainer(workspaceId,{ownerMemberId:manager,visibility:'private'})).containerId;
 for(const principalId of [owner,reader])await seedContainerGrant(containerId,{principalKind:'member',principalId,level:principalId===owner?'full':'edit'});
 const cookies={owner:await sessionFor(owner,{freshProof:true}),reader:await sessionFor(reader),manager:await sessionFor(manager,{freshProof:true})};
 const tokens=['synthetic-slate-101','synthetic-slate-102','synthetic-slate-103','synthetic-slate-104','synthetic-slate-105'];
 const secret=crypto.randomUUID(),origin='https://slate.test',key=()=>crypto.randomUUID();
 const bindings:AppBindings={...env,SLATE_PROFILE:undefined,CONNECTOR_CREDENTIALS_KEY:secret,APP_URL:origin};
 const app=createApi(),edge=chatNetwork(tokens,'synthetic-slate-2@example.test');
 const nookMember={email:'synthetic-slate-2@example.test',verified:true,guest:false,external:false,bot:false};
 let nookFacts={channel:'synthetic-slate-channel',private:true,shared:false,archived:false,revoked:false,rosterComplete:true,membershipManagedByMembers:true,appId:'synthetic-slate-app',members:[{...nookMember}]};
 // NOOK-080 is a capability edge, with no invented public Nook HTTP endpoint.
 bindings.NOOK_NOTIFIER={
  async audience(token,channel){expect(token).toBe(tokens[4]);expect(channel).toBe(nookFacts.channel);const f=edge.failures.get(token);if(f==='revoked'||f==='expired')return new Response('',{status:401});return Response.json(nookFacts);},
  async post(token,input){
   expect(input.channel).toBe(nookFacts.channel);const f=edge.failures.get(token),status=f==='transient'?429:f==='permanent'?404:f==='uncertain'?503:200;
   edge.attempts.push({token,key:input.clientKey,status});
   if(status===429){edge.failures.delete(token);return new Response('',{status:429,headers:{'Retry-After':'120'}});}
   if(status!==200)return new Response('',{status});
   const prior=edge.messages.find(m=>m.token===token&&m.key===input.clientKey);if(prior)return Response.json({receipt:prior.receipt});
   const receipt=String(edge.messages.length+1);edge.messages.push({token,provider:'nook',channel:input.channel,text:input.text,key:input.clientKey,receipt,thread:input.thread});return Response.json({receipt});
  },
  async editOwn(token,input){const message=edge.messages.find(m=>m.token===token&&m.channel===input.channel&&m.receipt===input.receipt);expect(message).toBeTruthy();message!.text=input.text;return new Response(null,{status:204});},
  async find(){return Response.json({receipt:null});},
 };
 const raw=(method:string,path:string,body?:unknown,actor:keyof typeof cookies='owner',runtime=bindings)=>app.request(origin+path,{method,headers:{cookie:cookies[actor],origin,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)},runtime);
 const api=async(method:string,path:string,body?:unknown,actor:keyof typeof cookies='owner',runtime=bindings)=>{
  const response=await raw(method,path,body,actor,runtime),text=await response.text();
  for(const token of tokens)expect(text).not.toContain(token);
  expect(text).not.toContain('credential_ciphertext');expect(response.status,text).toBe(200);return JSON.parse(text);
 };
 const list=async(actor:keyof typeof cookies='owner')=>(await api('GET','/api/notifications/chat/destinations',undefined,actor)).items as any[];
 const destination=async(id:string)=>(await list()).find(item=>item.id===id);
 const history=async(id:string)=>(await api('GET',`/api/notifications/chat/destinations/${id}/deliveries`)).items;
 const drain=async(runtime=bindings)=>{
  await runtime.DB.prepare("UPDATE chat_deliveries SET created_at=? WHERE state='pending' AND message_id IS NULL AND created_at>=?").bind(new Date(Date.now()-120000).toISOString(),new Date().toISOString().slice(0,10)).run();
  await runtime.DB.prepare("UPDATE notification_outbox SET created_at=? WHERE processed_at IS NULL").bind(new Date(Date.now()-120000).toISOString()).run();
  const ack=vi.fn(),retry=vi.fn();
  await worker.queue!({queue:'synthetic-slate-1',metadata:{metrics:{backlogCount:1,backlogBytes:0}},messages:[{id:key(),body:{type:'discovery.deliver'},timestamp:new Date(),attempts:1,ack,retry}],ackAll:vi.fn(),retryAll:vi.fn()} as MessageBatch<unknown>,runtime);
  expect(retry).not.toHaveBeenCalled();expect(ack).toHaveBeenCalledOnce();
 };
 const events=['published','page-edited','comment','post-published','review-requested','verification-lapsed'];
 const connect=(token:string,provider='slack',channel='GSLATE2',selected=events,scope:string|null=null,actor:keyof typeof cookies='owner')=>api('POST','/api/notifications/chat/destinations',{operationKey:key(),provider,channel,token,events:selected,containerId:scope},actor);
 const reconnect=async(id:string,token:string,actor:keyof typeof cookies='owner',deliveryMode:'immediate'|'daily'='immediate')=>{const c=await destination(id);return api('PUT',`/api/notifications/chat/destinations/${id}`,{operationKey:key(),deliveryMode,provider:c.provider,containerId:c.containerId,channel:c.destination.slice(c.provider.length+1),token,events:JSON.parse(c.eventsJson),expectedRevisionId:c.revisionId},actor);};
 const disconnect=async(id:string)=>api('DELETE',`/api/notifications/chat/${id}`,{operationKey:key(),expectedRevisionId:(await destination(id)).revisionId});
 try{
  expect((await api('GET','/api/profile')).profile).toBe('core-wiki');
  expect((await raw('POST','/api/notifications/chat/destinations',{operationKey:key(),containerId:{},channel:'GSLATE2',token:tokens[1],events})).status).toBe(400);
  const pageId=(await api('POST','/api/pages',{operationKey:key(),containerId,title:'synthetic-slate-20'})).value.pageId;
  const doc=async()=>api('GET',`/api/pages/${pageId}`);
  const comment=()=>api('POST',`/api/comments/page/${pageId}`,{operationKey:key(),body:[{text:'synthetic-slate-private-comment-body'}]});
  await drain();
  const first=(await api('POST','/api/notifications/chat',{operationKey:key(),channel:'GSLATE1',token:tokens[0],events})).value.id;
  expect((await raw('POST','/api/notifications/chat/destinations',{operationKey:key(),channel:'GSLATE2',token:tokens[1],events},'reader')).status).toBe(403);
  expect((await raw('POST','/api/notifications/chat/destinations',{operationKey:key(),channel:'GSLATE2',token:tokens[1],events},'manager')).status).toBe(403);
  const refusals:SlackAudienceFixture[]=[{channel:{is_private:false}},{channel:{is_ext_shared:true}},{channel:{is_org_shared:true}},
   {users:{READER:{profile:{email:'synthetic-slate-2@example.test'}},OTHER:{is_bot:true}}},
   {users:{READER:{profile:{}}}},{users:{READER:{profile:{email:'synthetic-slate-99@example.test'}}}},{users:{READER:{profile:{email:'synthetic-slate-4@example.test'}}}}];
  for(const audience of refusals){
   edge.audiences.set(tokens[1]!,audience);
   const response=await raw('POST','/api/notifications/chat/destinations',{operationKey:key(),channel:'GSLATE2',token:tokens[1],events});
   expect([409,422]).toContain(response.status);for(const token of tokens)expect(await response.clone().text()).not.toContain(token);
   expect(await list()).toHaveLength(1);
  }
  edge.audiences.set(tokens[1]!,{users:{READER:{profile:{email:'synthetic-slate-2@example.test'}},DEACTIVATED:{deleted:true}}});
  const second=(await connect(tokens[1]!,'slack','GSLATE2',['comment'],containerId,'manager')).value.id;
  // Invalid provider facts are refused before credential persistence.
  for(const change of [{guest:true},{external:true},{bot:true},{verified:false}]){
   nookFacts.members=[{...nookMember,...change}];
   expect((await raw('POST','/api/notifications/chat/destinations',{operationKey:key(),provider:'nook',channel:nookFacts.channel,token:tokens[4],events})).status).toBe(422);
  }
  nookFacts.members=[{...nookMember}];nookFacts.shared=true;
  expect((await raw('POST','/api/notifications/chat/destinations',{operationKey:key(),provider:'nook',channel:nookFacts.channel,token:tokens[4],events})).status).toBe(422);nookFacts.shared=false;
  for(const member of [
   {'@odata.type':'#microsoft.graph.aadUserConversationMember',email:'synthetic-slate-2@example.test',userId:'synthetic-slate-reader',tenantId:'synthetic-slate-tenant',roles:['guest']},
   {'@odata.type':'#microsoft.graph.aadUserConversationMember',email:'synthetic-slate-2@example.test',userId:'synthetic-slate-reader',tenantId:'synthetic-other-tenant',roles:[]},
   {'@odata.type':'#microsoft.graph.botConversationMember',email:'synthetic-slate-2@example.test'},
  ]){edge.teamsMembers.set(tokens[2]!,[member]);expect((await raw('POST','/api/notifications/chat/destinations',{operationKey:key(),provider:'teams',channel:'synthetic-slate-5/synthetic-slate-6',token:tokens[2],events})).status).toBe(422);}
  edge.teamsMembers.delete(tokens[2]!);edge.teamsRooms.set(tokens[2]!,{membershipType:'shared'});
  expect((await raw('POST','/api/notifications/chat/destinations',{operationKey:key(),provider:'teams',channel:'synthetic-slate-5/synthetic-slate-6',token:tokens[2],events})).status).toBe(422);edge.teamsRooms.delete(tokens[2]!);
  edge.teamsApps.set(tokens[2]!,[{teamsAppDefinition:{bot:{id:'synthetic-other-bot'}}}]);
  expect((await raw('POST','/api/notifications/chat/destinations',{operationKey:key(),provider:'teams',channel:'synthetic-slate-5/synthetic-slate-6',token:tokens[2],events})).status).toBe(422);edge.teamsApps.delete(tokens[2]!);
  const teams=(await connect(tokens[2]!,'teams','synthetic-slate-5/synthetic-slate-6')).value.id;
  expect((await list('manager')).map(item=>item.id)).toEqual([second]);expect(await list('reader')).toEqual([]);
  expect((await raw('DELETE',`/api/notifications/chat/${teams}`,{operationKey:key(),expectedRevisionId:(await destination(teams)).revisionId},'manager')).status).toBe(403);
  expect((await raw('GET',`/api/notifications/chat/destinations/${teams}/deliveries`,undefined,'manager')).status).toBe(403);
  const nook=(await connect(tokens[4]!,'nook',nookFacts.channel)).value.id;
  const ids=[first,second,teams,nook],activeTokens=[tokens[0]!,tokens[1]!,tokens[2]!,tokens[4]!];
  for(const [i,id] of ids.entries()){
   const row=await env.DB.prepare('SELECT * FROM chat_connections WHERE id=?').bind(id).first<any>();
   expect(row.credential_ciphertext).not.toContain(activeTokens[i]);expect(await decryptSecret(secret,row.credential_ciphertext,chatScope(workspaceId,id,row.notifier_provider??row.provider))).toBe(activeTokens[i]);
  }
  await api('POST',`/api/pages/${pageId}/publish`,{operationKey:key(),expectedRevisionId:(await doc()).page.revisionId});await drain();
  await api('PUT',`/api/pages/${pageId}/blocks`,{operationKey:key(),expectedRevisionId:(await doc()).page.revisionId,blocks:[{id:key(),blockType:'paragraph',treePosition:'a',content:{text:[{text:'synthetic-slate-private-page-body'}]}}]});await drain();
  await comment();await drain();
  await api('POST',`/api/blog/containers/${containerId}/posts`,{operationKey:key(),title:'synthetic-slate-21',body:'synthetic-slate-private-blog-body'});await drain();
  await api('POST',`/api/status/requests/page/${pageId}`,{operationKey:key(),expectedRevisionId:(await doc()).page.revisionId,assigneeKind:'member',assigneeId:reader,date:'2099-01-01',time:'12:00',timezone:'UTC',note:'synthetic-slate-private-review-note'});await drain();
  await api('POST','/api/status',{operationKey:key(),key:'verified',label:'Verified',color:'#228855',requiresVerification:true});
  const current=await doc();
  await api('POST',`/api/pages/${pageId}/open`,{operationKey:key(),revisionId:current.workingRevisionId});
  await api('POST',`/api/status/page/${pageId}`,{operationKey:key(),expectedRevisionId:current.page.revisionId,statusKey:'verified',attestRevisionId:current.workingRevisionId,expiresInDays:7});
  await env.DB.prepare('UPDATE page_verifications SET expires_at=? WHERE page_id=?').bind('2000-01-01T00:00:00.000Z',pageId).run();
  await runContentJobs(bindings);await drain();await drain();
  for(const [i,token] of activeTokens.entries()){
   const messages=edge.messages.filter(m=>m.token===token);
   expect(messages.map(m=>m.text.split(' · ')[0]).sort()).toEqual((i===1?['comment']:events).toSorted());
   for(const message of messages){expect(message.text.split(' · ')).toHaveLength(4);expect(message.text).toContain('/app/pages/');expect(message.text).not.toContain('private-');}
   expect((await destination(ids[i]!)).lastDeliveredAt).toBeTruthy();
   expect((await history(ids[i]!)).filter((item:any)=>item.state==='delivered')).toHaveLength(i===1?1:events.length);
  }
  // One completed minute with twenty events produces one message per destination, retaining every event.
  const roots=new Map(activeTokens.map(token=>[token,edge.messages.find(m=>m.token===token&&m.text.includes(`/app/pages/${pageId}`))!.receipt]));
  const burstStart=edge.messages.length;
  for(let i=0;i<20;i++)await comment();await drain();
  const burst=edge.messages.slice(burstStart);expect(burst).toHaveLength(ids.length);
  for(const message of burst){expect(message.text.split('\n')).toHaveLength(20);expect(message.thread).toBe(roots.get(message.token));}
  const afterBurst=edge.messages.length;await comment();await drain();expect(edge.messages).toHaveLength(afterBurst+ids.length);
  for(const message of edge.messages.slice(afterBurst))expect(message.thread).toBe(roots.get(message.token));
  await env.DB.prepare("UPDATE chat_messages SET created_at=? WHERE thread_receipt IS NULL").bind(new Date(Date.now()-25*3600000).toISOString()).run();
  const expiredThreadStart=edge.messages.length;await comment();await drain();
  for(const message of edge.messages.slice(expiredThreadStart))expect(message.thread).toBeUndefined();
  for(const [i,id] of ids.entries())await reconnect(id,activeTokens[i]!,i===1?'manager':'owner','daily');
  const digestStart=edge.messages.length;await comment();await comment();await drain();expect(edge.messages).toHaveLength(digestStart);
  await env.DB.prepare("UPDATE chat_deliveries SET created_at='2000-01-01T00:00:00.000Z' WHERE state='pending'").run();
  await drain();expect(edge.messages).toHaveLength(digestStart+ids.length);
  for(const message of edge.messages.slice(digestStart))expect(message.text.split('\n')).toHaveLength(2);
  for(const [i,id] of ids.entries())await reconnect(id,activeTokens[i]!,i===1?'manager':'owner');
  console.log('PASS CHAT-001 Teams/Nook audience refusal, twenty-event coalescing, 24-hour threading and per-destination daily digest');
  for(const change of [{guest:true},{external:true},{bot:true},{verified:false}]){
   nookFacts.members=[{...nookMember,...change}];const prior=edge.messages.filter(m=>m.token===tokens[4]).length;
   await comment();await drain();expect(edge.messages.filter(m=>m.token===tokens[4])).toHaveLength(prior);
  }
  nookFacts.members=[{...nookMember}];
  // Every audience, including the second Slack destination, fails closed before a send.
  for(const audience of refusals){
   edge.audiences.set(tokens[1]!,audience);const before=edge.messages.filter(m=>m.token===tokens[1]).length;
   await comment();await drain();expect(edge.messages.filter(m=>m.token===tokens[1])).toHaveLength(before);
   expect((await destination(second)).lastFailureReason).toBeTruthy();
  }
  edge.audiences.delete(tokens[1]!);
  edge.teamsMembers.set(tokens[2]!,[{'@odata.type':'#microsoft.graph.aadUserConversationMember'}]);
  const beforeTeams=edge.messages.filter(m=>m.token===tokens[2]).length;await comment();await drain();expect(edge.messages.filter(m=>m.token===tokens[2])).toHaveLength(beforeTeams);edge.teamsMembers.delete(tokens[2]!);
  const beforeChannelChange=await destination(first);
  await api('PUT',`/api/notifications/chat/destinations/${first}`,{operationKey:key(),provider:'slack',channel:'GSLATE9',token:tokens[0],events,expectedRevisionId:beforeChannelChange.revisionId});
  const beforeDenied=edge.messages.length;
  await comment();await env.DB.prepare('UPDATE container_grants SET revoked_at=? WHERE container_id=? AND principal_id=?').bind(new Date().toISOString(),containerId,reader).run();
  await drain();expect(edge.messages).toHaveLength(beforeDenied);
  for(const message of edge.messages.filter(m=>m.text.includes(`/app/pages/${pageId}`)))throw new Error('A narrowed page title survived withdrawal: '+message.provider);
  expect(edge.messages.some(m=>m.text==='Restricted Slate page')).toBe(true);
  expect((await raw('GET',`/api/pages/${pageId}`,undefined,'reader')).status).toBe(404);
  expect((await app.request(origin+`/api/pages/${pageId}`,{},bindings)).status).toBe(401);
  const execution=createExecutionContext(),linked=await handleApplicationRequest(new Request(origin+`/app/pages/${pageId}`),bindings,execution);expect(linked.status).toBe(302);expect(linked.headers.get('location')).toContain('/signin');await waitOnExecutionContext(execution);
  await env.DB.prepare('UPDATE container_grants SET revoked_at=NULL WHERE container_id=? AND principal_id=?').bind(containerId,reader).run();
  // Each provider's transient rejection retries with the same operation key; permanent and uncertain writes do not.
  for(const [i,token] of activeTokens.entries()){
   edge.failures.set(token,'transient');await comment();await drain();
   expect((await destination(ids[i]!)).lastFailureReason).toBe('rate_limited');
   const cooldown=(await env.DB.prepare('SELECT retry_after FROM chat_connections WHERE id=?').bind(ids[i]).first<string>('retry_after'))!;expect(Date.parse(cooldown)-Date.now()).toBeGreaterThan(100000);
   const calls=edge.attempts.length;await drain();expect(edge.attempts).toHaveLength(calls);
   const failed=edge.attempts.filter(a=>a.token===token).at(-1)!;
   await env.DB.prepare("UPDATE chat_deliveries SET next_attempt_at='2000-01-01T00:00:00.000Z' WHERE connection_id=? AND state='pending'").bind(ids[i]).run();
   await env.DB.prepare("UPDATE chat_connections SET retry_after=NULL WHERE id=?").bind(ids[i]).run();
   await drain();await drain();expect(edge.attempts.filter(a=>a.token===token).at(-1)!.key).toBe(failed.key);
   expect(edge.messages.filter(m=>m.token===token&&m.key===failed.key)).toHaveLength(1);
   for(const failure of ['permanent','uncertain']){edge.failures.set(token,failure);await comment();await drain();const n=edge.attempts.length;await drain();expect(edge.attempts).toHaveLength(n);edge.failures.delete(token);}
   for(const failure of ['revoked','expired']){
    const selection=(await destination(ids[i]!)).eventsJson,previous=(await history(ids[i]!)).length;
    edge.failures.set(token,failure);await comment();await drain();
    expect(await destination(ids[i]!)).toMatchObject({state:'needs-attention',eventsJson:selection});
    expect((await history(ids[i]!)).length).toBeGreaterThanOrEqual(previous);
    const own=edge.messages.filter(m=>m.token===token).length,others=edge.messages.length;
    await comment();await drain();expect(edge.messages.filter(m=>m.token===token)).toHaveLength(own);expect(edge.messages.length).toBeGreaterThan(others);
    const retained=await history(ids[i]!);edge.failures.delete(token);await reconnect(ids[i]!,token,i===1?'manager':'owner');expect(await history(ids[i]!)).toEqual(retained);
   }
  }
  // A destination authorized through an existing personal Slack source uses the same channel/audience rules.
  const sourceId='synthetic-slate-source',sourceRevision=key();
  await env.DB.prepare("INSERT INTO federation_connections(id,workspace_id,member_id,provider,account_id,credential_ciphertext,config_json,state,revision_id,created_at,updated_at) VALUES(?,?,?,'slack','synthetic-slate-10',?,?,'connected',?,?,?)").bind(sourceId,workspaceId,owner,await encryptSecret(secret,tokens[3]!,`connector:${sourceId}`),JSON.stringify({principalId:'SENDER'}),sourceRevision,new Date().toISOString(),new Date().toISOString()).run();
  const sourceInput={operationKey:key(),connectionId:sourceId,connectionRevisionId:sourceRevision,channel:'GSLATE4',events:['comment']};
  expect((await raw('POST','/api/notifications/chat/destinations',{...sourceInput,provider:'teams'})).status).toBe(400);
  edge.audiences.set(tokens[3]!,{channel:{is_private:false}});expect((await raw('POST','/api/notifications/chat/destinations',sourceInput)).status).toBe(422);
  edge.audiences.delete(tokens[3]!);const sourceDestination=(await api('POST','/api/notifications/chat/destinations',{...sourceInput,operationKey:key()})).value.id;
  expect((await api('GET','/api/notifications/chat')).connection.id).toBe(first);
  await comment();await drain();expect(edge.messages.some(m=>m.token===tokens[3])).toBe(true);
  edge.audiences.set(tokens[3]!,{channel:{is_org_shared:true}});const sourceSends=edge.messages.filter(m=>m.token===tokens[3]).length;await comment();await drain();expect(edge.messages.filter(m=>m.token===tokens[3])).toHaveLength(sourceSends);edge.audiences.delete(tokens[3]!);
  await disconnect(sourceDestination);
  expect(await env.DB.prepare('SELECT credential_ciphertext FROM chat_connections WHERE id=?').bind(sourceDestination).first('credential_ciphertext')).toBeNull();
  // Deletion withdraws every message about the page, preserving opaque receipts only.
  const doomed=(await api('POST','/api/pages',{operationKey:key(),containerId,title:'synthetic-slate-doomed'})).value.pageId;
  await api('POST',`/api/comments/page/${doomed}`,{operationKey:key(),body:[{text:'synthetic-slate-deletion-body'}]});await drain();
  const doomedMessages=edge.messages.filter(m=>m.text.includes(`/app/pages/${doomed}`));expect(doomedMessages.length).toBeGreaterThan(0);
  const doomedDocument=await api('GET',`/api/pages/${doomed}`);
  await api('POST',`/api/archive/${doomed}`,{operationKey:key(),expectedRevisionId:doomedDocument.page.revisionId,action:'trash'});
  await api('POST',`/api/archive/${doomed}/permanent-delete`,{operationKey:key(),confirmedPageIds:[doomed]});await drain();
  for(const message of doomedMessages)expect(message.text).toBe('Restricted Slate page');
  expect(await env.DB.prepare('SELECT count(*) AS n FROM chat_message_sources WHERE page_id=?').bind(doomed).first<number>('n')).toBe(0);
  // Erase a separate actor while channel members and destination owners stay active.
  const erased=(await seedMember(workspaceId,{role:'member',email:'synthetic-slate-erase@example.test',displayName:'synthetic-slate-erase'})).memberId;
  await seedContainerGrant(containerId,{principalKind:'member',principalId:erased,level:'edit'});
  const erasedCookie=await sessionFor(erased);
  const actorReply=await app.request(origin+`/api/comments/page/${pageId}`,{method:'POST',headers:{cookie:erasedCookie,origin,'content-type':'application/json'},body:JSON.stringify({operationKey:key(),body:[{text:'synthetic-slate-actor-body'}]})},bindings);expect(actorReply.status).toBe(200);
  const actorStart=edge.messages.length;await drain();const actorMessages=edge.messages.slice(actorStart);expect(actorMessages.length).toBeGreaterThan(0);
  const queuedErasure=await app.request(origin+`/api/comments/page/${pageId}`,{method:'POST',headers:{cookie:erasedCookie,origin,'content-type':'application/json'},body:JSON.stringify({operationKey:key(),body:[{text:'synthetic-slate-pending-erasure'}]})},bindings);expect(queuedErasure.status).toBe(200);
  const beforeErasure=edge.messages.length;
  await api('POST','/api/members/remove',{operationKey:key(),memberId:erased,erase:true});await drain();expect(edge.messages).toHaveLength(beforeErasure);
  for(const message of actorMessages)expect(message.text).toBe('Restricted Slate page');
  expect(await env.DB.prepare('SELECT count(*) AS n FROM chat_message_sources WHERE actor_member_id=?').bind(erased).first<number>('n')).toBe(0);
  console.log('PASS CHAT-001 withdrawal after page deletion, audience narrowing and actor erasure; durable receipts omit erased references');
  // Workspace export retains destination records/history while omitting every credential value.
  const exported=await api('POST','/api/exports/workspace',{operationKey:key()});
  const download=await raw('GET',`/api/exports/${exported.id}/download`);expect(download.status).toBe(200);
  const archive=await decodeArchive(new Uint8Array(await download.arrayBuffer()));
  for(const row of archive.manifest.tables.chat_connections!){expect(row.credential_ciphertext).toBeNull();expect(row.state).toBe('disconnected');}
  for(const token of tokens)expect(JSON.stringify(archive.manifest)).not.toContain(token);
  expect(archive.manifest.tables.chat_messages!.length).toBeGreaterThan(0);
  expect(JSON.stringify(archive.manifest.tables.chat_message_sources)).not.toContain(erased);
  for(const row of archive.manifest.tables.chat_messages!)expect(row).not.toHaveProperty('text');
  // A populated v0.4.0-shaped store upgrades additively, keeping its original ID, scope, ciphertext and delivered history.
  const prior=(env as unknown as {PRIOR_DB:D1Database}).PRIOR_DB;
  await applyD1Migrations(prior,env.TEST_MIGRATIONS.filter(m=>m.name<'0045_chat_destinations.sql'));
  for(const table of ['workspaces','members','member_authority','containers','container_owners','container_grants','sessions','pages','page_revisions','page_blocks','content_published_revisions','notification_outbox']){
   const rows=(await env.DB.prepare(`SELECT * FROM ${table}`).all<any>()).results;
   for(const row of rows){const columns=Object.keys(row);await prior.prepare(`INSERT ${table==='content_published_revisions'?'OR IGNORE ':''}INTO ${table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).bind(...Object.values(row)).run();}
  }
  const old=await env.DB.prepare('SELECT * FROM chat_connections WHERE id=?').bind(first).first<any>();delete old.provider;delete old.container_id;delete old.notifier_provider;delete old.delivery_mode;delete old.retry_after;
  const columns=Object.keys(old);await prior.prepare(`INSERT INTO chat_connections(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).bind(...Object.values(old)).run();
  const delivered=await env.DB.prepare("SELECT * FROM chat_deliveries WHERE connection_id=? AND state='delivered' LIMIT 1").bind(first).first<any>();
  delete delivered.message_id;
  const dc=Object.keys(delivered);await prior.prepare(`INSERT INTO chat_deliveries(${dc.join(',')}) VALUES(${dc.map(()=>'?').join(',')})`).bind(...Object.values(delivered)).run();
  await applyD1Migrations(prior,env.TEST_MIGRATIONS.filter(m=>m.name<'0046_chat_delivery_policy.sql'));
  const c7a=await env.DB.prepare('SELECT * FROM chat_connections WHERE id=?').bind(teams).first<any>();
  delete c7a.notifier_provider;delete c7a.delivery_mode;delete c7a.retry_after;
  const tc=Object.keys(c7a);await prior.prepare(`INSERT INTO chat_connections(${tc.join(',')}) VALUES(${tc.map(()=>'?').join(',')})`).bind(...Object.values(c7a)).run();
  await applyD1Migrations(prior,env.TEST_MIGRATIONS);
  expect(await prior.prepare('SELECT * FROM chat_connections WHERE id=?').bind(teams).first()).toEqual({...c7a,notifier_provider:null,delivery_mode:'immediate',retry_after:null});
  expect(await prior.prepare('SELECT provider_receipt FROM chat_messages WHERE id=?').bind(delivered.id).first('provider_receipt')).toBe(delivered.provider_receipt);
  expect(await prior.prepare('SELECT destination FROM chat_messages WHERE id=?').bind(delivered.id).first('destination')).toBe('slack:'+JSON.parse(delivered.provider_receipt).channel);
  expect(await prior.prepare('SELECT * FROM chat_connections WHERE id=?').bind(first).first()).toEqual({...old,provider:'slack',container_id:null,notifier_provider:null,delivery_mode:'immediate',retry_after:null});
  expect(await prior.prepare('SELECT * FROM chat_deliveries WHERE id=?').bind(delivered.id).first()).toEqual({...delivered,message_id:delivered.id});
  const upgraded={...bindings,DB:prior};
  expect((await api('GET','/api/notifications/chat',undefined,'owner',upgraded)).connection.id).toBe(first);
  const upgradedSends=edge.messages.filter(m=>m.token===tokens[0]).length;
  await api('POST',`/api/comments/page/${pageId}`,{operationKey:key(),body:[{text:'synthetic-slate-upgrade-body'}]},'owner',upgraded);await drain(upgraded);
  expect(edge.messages.filter(m=>m.token===tokens[0])).toHaveLength(upgradedSends+1);
  console.log('PASS CHAT-001 populated v0.4.0 upgrade through 0046, and populated c7a upgrade, public legacy route and delivery; export credentials omitted');
  // Erasing the container owner removes that destination's credential and audience references.
  await api('POST','/api/members/remove',{operationKey:key(),memberId:manager,erase:true});
  expect(await env.DB.prepare('SELECT credential_ciphertext,state FROM chat_connections WHERE id=?').bind(second).first()).toEqual({credential_ciphertext:null,state:'disconnected'});
  expect(await env.DB.prepare('SELECT count(*) AS n FROM chat_connections,json_each(audience_member_ids_json) WHERE value=?').bind(manager).first<number>('n')).toBe(0);
  await disconnect(nook);
  // Missing-key startup is checked with only Teams connected, then disconnect wins at the final audience lookup.
  await disconnect(first);
  const remaining=edge.messages.length;await comment();await drain();expect(edge.messages).toHaveLength(remaining+1);expect(edge.messages.at(-1)!.token).toBe(tokens[2]);
  await env.DB.prepare("UPDATE federation_connections SET state='revoked',credential_ciphertext=NULL WHERE id=?").bind(sourceId).run();
  const missing={...bindings,CONNECTOR_CREDENTIALS_KEY:undefined};await expect(assertStoredConfiguration(missing)).rejects.toThrow('CONNECTOR_CREDENTIALS_KEY');
  const startup=await raw('GET','/api/notifications/chat/destinations',undefined,'owner',missing);expect(startup.status).toBe(503);expect(await startup.text()).toContain('CONNECTOR_CREDENTIALS_KEY');
  await comment();const beforeDisconnect=edge.messages.length;
  edge.duringAudience(()=>disconnect(teams));await drain();await comment();await drain();expect(edge.messages).toHaveLength(beforeDisconnect);
  expect(await env.DB.prepare('SELECT credential_ciphertext FROM chat_connections WHERE id=?').bind(teams).first('credential_ciphertext')).toBeNull();
  await expect(assertStoredConfiguration(missing)).resolves.toBeUndefined();
  expect(await env.DB.prepare('SELECT count(*) AS n FROM chat_connections,json_each(audience_member_ids_json) WHERE value=?').bind(reader).first<number>('n')).toBeGreaterThan(0);
  await api('POST','/api/members/remove',{operationKey:key(),memberId:reader,erase:true});
  expect(await env.DB.prepare('SELECT count(*) AS n FROM chat_connections,json_each(audience_member_ids_json) WHERE value=?').bind(reader).first<number>('n')).toBe(0);
  console.log('PASS CHAT-001 per-destination selection, access, retry, authorization, custody, erasure and disconnect');
 }finally{edge.restore();vi.useRealTimers();}
});


/** Public notification routes and queue, with fakes only at provider edges. */
async function repairJourney() {
 await resetDeployment();
 const {workspaceId}=await seedWorkspace(),key=()=>crypto.randomUUID();
 const ownerEmail='synthetic-slate-owner@example.test',readerEmail='synthetic-slate-reader@example.test';
 const owner=(await seedMember(workspaceId,{role:'owner',email:ownerEmail,displayName:'synthetic-slate-owner'})).memberId;
 const reader=(await seedMember(workspaceId,{role:'member',email:readerEmail,displayName:'synthetic-slate-reader'})).memberId;
 const open=(await seedContainer(workspaceId,{ownerMemberId:owner,visibility:'private'})).containerId;
 const closed=(await seedContainer(workspaceId,{ownerMemberId:owner,visibility:'private'})).containerId;
 await seedContainerGrant(open,{principalKind:'member',principalId:reader,level:'edit'});
 for(const containerId of [open,closed])await seedContainerGrant(containerId,{principalKind:'member',principalId:owner,level:'full'});
 const cookie=await sessionFor(owner,{freshProof:true}),origin='https://slate.test';
 const tokens=['synthetic-slate-201','synthetic-slate-202','synthetic-slate-203','synthetic-slate-204','synthetic-slate-205'];
 const edge=chatNetwork(tokens,readerEmail),bindings:AppBindings={...env,SLATE_PROFILE:undefined,APP_URL:origin,CONNECTOR_CREDENTIALS_KEY:key()};
 const channels=['GSLATE1','synthetic-slate-team/synthetic-slate-channel','synthetic-slate-channel1'];
 const nookScopes=new Map([[tokens[2]!,channels[2]!],[tokens[3]!,'synthetic-slate-channel3'],[tokens[4]!,channels[2]!]]);
 const nookCalls:{channel:string;allowed:boolean;operation:string}[]=[];
 const allowed=(token:string,channel:string,operation:string)=>{const ok=nookScopes.get(token)===channel;nookCalls.push({channel,allowed:ok,operation});return ok;};
 bindings.NOOK_NOTIFIER={
  async audience(token,channel){if(!allowed(token,channel,'audience'))return new Response(null,{status:403});edge.audienceCalls.push({token,channel});return Response.json({channel,private:true,shared:false,archived:false,revoked:false,rosterComplete:true,membershipManagedByMembers:true,appId:'synthetic-slate-app',members:(edge.rosters.get(token+':'+channel)??[readerEmail]).map(email=>({email,verified:true,guest:false,external:false,bot:false}))});},
  async post(token,input){if(!allowed(token,input.channel,'post'))return new Response(null,{status:403});const f=edge.failures.get(token);const status=f==='transient'?429:f==='uncertain'?503:200;edge.attempts.push({token,key:input.clientKey,status});if(status===429){edge.failures.delete(token);return new Response(null,{status:429,headers:{'Retry-After':'120'}});}if(status!==200)return new Response(null,{status});const prior=edge.messages.find(m=>m.channel===input.channel&&m.key===input.clientKey);if(prior)return Response.json({receipt:prior.receipt});const receipt=String(edge.messages.length+1);edge.messages.push({token,provider:'nook',channel:input.channel,text:input.text,key:input.clientKey,receipt,thread:input.thread});return Response.json({receipt});},
  async editOwn(token,input){if(!allowed(token,input.channel,'edit'))return new Response(null,{status:403});const message=edge.messages.find(m=>m.provider==='nook'&&m.channel===input.channel&&m.receipt===input.receipt);if(!message)return new Response(null,{status:404});message.text=input.text;return new Response(null,{status:204});},
  async find(token,{channel,clientKey}){if(!allowed(token,channel,'find'))return new Response(null,{status:403});return Response.json({receipt:edge.messages.find(m=>m.channel===channel&&m.key===clientKey)?.receipt??null});},
 };
 const app=createApi();
 const raw=(method:string,path:string,body?:unknown)=>app.request(origin+path,{method,headers:{cookie,origin,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)},bindings);
 const api=async(method:string,path:string,body?:unknown)=>{const r=await raw(method,path,body),text=await r.text();expect(r.status,text).toBe(200);for(const token of tokens)expect(text).not.toContain(token);return JSON.parse(text);};
 const destination=async(id:string)=>(await api('GET','/api/notifications/chat/destinations')).items.find((c:any)=>c.id===id);
 const connect=async(provider:string,token:string,channel:string,deliveryMode='immediate')=>(await api('POST','/api/notifications/chat/destinations',{operationKey:key(),provider,token,channel,events:['comment'],deliveryMode})).value.id as string;
 const update=async(id:string,token:string,channel:string,deliveryMode='immediate')=>raw('PUT','/api/notifications/chat/destinations/'+id,{operationKey:key(),provider:(await destination(id)).provider,expectedRevisionId:(await destination(id)).revisionId,token,channel,events:['comment'],deliveryMode});
 const page=async(title:string,containerId=open)=>(await api('POST','/api/pages',{operationKey:key(),containerId,title})).value.pageId as string;
 const comment=(id:string)=>api('POST','/api/comments/page/'+id,{operationKey:key(),body:[{text:'synthetic-slate-private-body'}]});
 const sweep=async(day=false)=>{
  // Move only event clocks; application outbox, claims and delivery execute unchanged.
  const at=day?'2000-01-01T00:00:00.000Z':new Date(Date.now()-120000).toISOString();
  await env.DB.prepare('UPDATE notification_outbox SET created_at=? WHERE processed_at IS NULL').bind(at).run();
  await env.DB.prepare("UPDATE chat_deliveries SET created_at=? WHERE state='pending' AND message_id IS NULL").bind(at).run();
  const ack=vi.fn(),retry=vi.fn();await worker.queue!({queue:'synthetic-slate-1',metadata:{metrics:{backlogCount:1,backlogBytes:0}},messages:[{id:key(),body:{type:'discovery.deliver'},timestamp:new Date(),attempts:1,ack,retry}],ackAll:vi.fn(),retryAll:vi.fn()} as MessageBatch<unknown>,bindings);expect(retry).not.toHaveBeenCalled();expect(ack).toHaveBeenCalledOnce();
 };
 const purge=async(id:string)=>{const doc=await api('GET','/api/pages/'+id);await api('POST','/api/archive/'+id,{operationKey:key(),expectedRevisionId:doc.page.revisionId,action:'trash'});await api('POST','/api/archive/'+id+'/permanent-delete',{operationKey:key(),confirmedPageIds:[id]});};
 return {edge,bindings,tokens,channels,nookCalls,ownerEmail,readerEmail,owner,reader,open,closed,key,raw,api,destination,connect,update,page,comment,sweep,purge};
}

contract('CHAT-001','Readable grouped events survive an unreadable or purged leader without duplicate delivery',async()=>{
 for(const scenario of ['C2','C2b','C3','C6','C6-reconcile','retry','retry-retarget','uncertain','five','six','concurrent']){
  const h=await repairJourney();
  try{
   const ids=[];for(const [i,provider] of ['slack','teams','nook'].entries())ids.push(await h.connect(provider,h.tokens[i]!,h.channels[i]!,scenario==='C3'?'daily':'immediate'));
   const denied=await h.page('synthetic-slate-forbidden',scenario.startsWith('C6')?h.open:h.closed),readable=await h.page('synthetic-slate-readable');
   if(['C2','C3','C6','C6-reconcile'].includes(scenario))await h.comment(denied);
   const count=scenario==='five'?5:6;
   for(let i=0;i<count;i++)await h.comment(readable);
   if(scenario==='C2b')await h.comment(denied);
   if(scenario==='concurrent'){
    const gate=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};};
    const firstAudience=gate(),secondAudience=gate(),firstMayContinue=gate(),secondMayContinue=gate(),posting=gate(),finishPost=gate();
    h.edge.duringAudience(async()=>{firstAudience.resolve();await firstMayContinue.promise;});
    const first=h.sweep();await firstAudience.promise;
    await h.comment(readable);
    h.edge.duringAudience(async()=>{secondAudience.resolve();await secondMayContinue.promise;});
    const second=h.sweep();await secondAudience.promise;
    h.edge.duringPost(async()=>{posting.resolve();await finishPost.promise;});
    try{
     firstMayContinue.resolve();await posting.promise;secondMayContinue.resolve();await second;
    }finally{firstMayContinue.resolve();secondMayContinue.resolve();finishPost.resolve();await Promise.all([first,second]);}
    await h.sweep();
    for(const provider of ['slack','teams','nook']){
     const lines=h.edge.messages.filter(m=>m.provider===provider).flatMap(m=>m.text.split('\n'));
     expect(lines,provider+' concurrent events').toHaveLength(7);expect(new Set(lines).size).toBe(7);
    }
    expect(await env.DB.prepare("SELECT count(*) AS n FROM chat_deliveries WHERE state='pending'").first<number>('n')).toBe(0);
    continue;
   }

   if(['C6','C6-reconcile','retry','retry-retarget','uncertain'].includes(scenario))for(const token of h.tokens.slice(0,3))h.edge.failures.set(token,scenario==='uncertain'?'uncertain':'transient');
   await h.sweep(scenario==='C3');
   if(['C6','C6-reconcile','retry','retry-retarget'].includes(scenario)){
    expect(h.edge.messages).toHaveLength(0);expect(h.edge.attempts.filter(a=>a.status===429)).toHaveLength(3);
    if(scenario==='retry-retarget')expect((await h.update(ids[0]!,h.tokens[0]!,'GSLATE9')).status).toBe(200);
    if(scenario.startsWith('C6'))await h.purge(denied);const calls=h.edge.attempts.length;await h.sweep();expect(h.edge.attempts).toHaveLength(calls);
    await env.DB.prepare("UPDATE chat_deliveries SET next_attempt_at='2000-01-01T00:00:00.000Z' WHERE state='pending'").run();await env.DB.prepare('UPDATE chat_connections SET retry_after=NULL').run();
   }
   if(scenario==='C6-reconcile'){const post=h.bindings.NOOK_NOTIFIER!.post;h.bindings.NOOK_NOTIFIER!.post=async(token,input)=>{const accepted=await post(token,input);expect(accepted.status).toBe(200);return new Response(null,{status:503});};}
   const attempts=h.edge.attempts.length;
   await h.sweep(scenario==='C3');await h.sweep(scenario==='C3');
   if(scenario==='uncertain'){expect(h.edge.attempts).toHaveLength(attempts);expect(h.edge.messages).toHaveLength(0);expect(await env.DB.prepare("SELECT count(*) AS n FROM chat_deliveries WHERE state='uncertain'").first<number>('n')).toBe(18);continue;}
   if(['retry','C6','C6-reconcile','retry-retarget'].includes(scenario))for(const token of h.tokens.slice(0,3)){const calls=h.edge.attempts.filter(a=>a.token===token);expect(calls).toHaveLength(2);expect(calls[1]!.key).toBe(calls[0]!.key);}
   if(scenario==='retry-retarget'){const message=h.edge.messages.find(m=>m.provider==='slack')!;expect(message.channel).toBe('GSLATE9');expect(await env.DB.prepare('SELECT destination FROM chat_messages WHERE connection_id=?').bind(ids[0]).first('destination')).toBe('slack:GSLATE9');await h.purge(readable);await h.sweep();expect(message.text).toBe('Restricted Slate page');continue;}
   if(scenario.startsWith('C6')){expect(await env.DB.prepare("SELECT count(*) n FROM chat_deliveries WHERE state='cancelled' AND failure='source_erased'").first<number>('n')).toBe(3);expect(await env.DB.prepare("SELECT count(*) n FROM chat_deliveries WHERE state='delivered'").first<number>('n')).toBe(18);}
   const pending=await env.DB.prepare("SELECT count(*) AS n FROM chat_deliveries WHERE state='pending'").first<number>('n');
   console.log('GROUP WITNESS',JSON.stringify({scenario,messages:['slack','teams','nook'].map(p=>h.edge.messages.filter(m=>m.provider===p).length),pending}));
   expect.soft(h.edge.messages,scenario).toHaveLength(scenario==='five'?15:3);expect.soft(pending,scenario).toBe(0);
   for(const m of h.edge.messages){expect(m.text).not.toContain('synthetic-slate-forbidden');expect(m.text).not.toContain('synthetic-slate-private-body');expect(m.text.split('\n')).toHaveLength(scenario==='five'?1:6);}
   expect.soft(await env.DB.prepare("SELECT count(*) AS n FROM chat_messages WHERE provider_receipt IS NULL AND state IN ('prepared','withdraw')").first<number>('n'),scenario+' ghost group').toBe(0);
  }finally{h.edge.restore();}
 }
});

contract('CHAT-001','Withdrawal uses each original channel roster in either receipt ordering',async()=>{
 for(const ordering of ['old-first','new-first','no-old'])for(const provider of ['slack','teams','nook']){
  const reverse=ordering==='new-first',control=ordering==='no-old';
  const h=await repairJourney();
  try{
   const i=['slack','teams','nook'].indexOf(provider),token=h.tokens[i]!,a=h.channels[i]!,b=provider==='slack'?'GSLATE9':provider==='teams'?'synthetic-slate-team/synthetic-slate-channel9':'synthetic-slate-channel3';
   const nextToken=provider==='nook'?h.tokens[3]!:token;
   h.edge.rosters.set(token+':'+a,[h.ownerEmail]);h.edge.rosters.set(nextToken+':'+b,[h.readerEmail]);
   if(provider==='nook'&&reverse)await h.connect(provider,nextToken,b);
   const id=await h.connect(provider,token,a),page=await h.page('synthetic-slate-channel-title');
   const order=control?[b]:reverse?[b,a]:[a,b];
   let nookB:string|undefined;
   if(provider==='nook'&&!reverse)nookB=await h.connect(provider,nextToken,b);
   for(const channel of order){
    if(provider!=='nook')expect((await h.update(id,token,channel)).status).toBe(200);
    await h.comment(page);await h.sweep();
   }
   const visible=h.edge.messages.filter(m=>m.channel===a.split('/').at(-1)||m.channel===a),restricted=h.edge.messages.filter(m=>m.channel===b.split('/').at(-1)||m.channel===b);
   if(!control||provider==='nook')expect(visible.length).toBeGreaterThan(0);else expect(visible).toHaveLength(0);expect(restricted.length).toBeGreaterThan(0);
   // Moving the page changes the two channels' effective audiences differently.
   const placement={containerId:h.closed,parentPageId:null,treePosition:'z'};
   const preview=await h.api('POST','/api/pages/'+page+'/move-preview',placement);
   const document=await h.api('GET','/api/pages/'+page);
   await h.api('POST','/api/pages/'+page+'/move',{...placement,operationKey:h.key(),expectedRevisionId:document.page.revisionId,accessPreviewHash:preview.accessPreviewHash});
   await h.sweep();await h.sweep();
   console.log('ROSTER WITNESS',JSON.stringify({provider,ordering,retained:visible.filter(m=>m.text.includes('synthetic-slate-channel-title')).length,restricted:restricted.filter(m=>m.text==='Restricted Slate page').length}));
   for(const m of visible)expect.soft(m.text,provider+' retained').toContain('synthetic-slate-channel-title');
   for(const m of restricted)expect.soft(m.text,provider+' withdrawn').toBe('Restricted Slate page');
   expect(h.nookCalls.every(c=>c.allowed)).toBe(true);
  }finally{h.edge.restore();}
 }
});

contract('CHAT-001','Nook channel changes are refused before custody changes while rotation and independent destinations work',async()=>{
 const h=await repairJourney();
 try{
  const id=await h.connect('nook',h.tokens[2]!,h.channels[2]!),page=await h.page('synthetic-slate-old-title');
  const unrelated=await h.connect('slack',h.tokens[0]!,h.channels[0]!);
  await h.comment(page);await h.sweep();const old=h.edge.messages.find(m=>m.provider==='nook')!;
  await h.purge(page);
  expect(await env.DB.prepare("SELECT count(*) AS n FROM chat_messages WHERE connection_id=? AND state='withdraw'").bind(id).first<number>('n')).toBe(1);
  const before=await env.DB.prepare('SELECT * FROM chat_connections WHERE id=?').bind(id).first();const calls=h.nookCalls.length;
  const refused=await h.update(id,h.tokens[3]!,'synthetic-slate-channel3');
  console.log('NOOK WITNESS',JSON.stringify({status:refused.status,providerCalls:h.nookCalls.length-calls}));
  expect.soft(refused.status).toBe(409);expect.soft(h.nookCalls.length).toBe(calls);expect.soft(await env.DB.prepare('SELECT * FROM chat_connections WHERE id=?').bind(id).first()).toEqual(before);
  expect(await refused.text()).toContain('CHAT_CHANNEL_FIXED');
  expect((await h.update(id,h.tokens[4]!,h.channels[2]!,'daily')).status).toBe(200);
  const newId=await h.connect('nook',h.tokens[3]!,'synthetic-slate-channel3');
  await h.sweep();expect(old.text).toBe('Restricted Slate page');
  expect((await h.destination(id)).deliveryMode).toBe('daily');expect((await h.destination(newId)).state).toBe('connected');
  const newPage=await h.page('synthetic-slate-independent');await h.comment(newPage);await h.sweep();expect(h.edge.messages.filter(m=>m.channel==='synthetic-slate-channel3'&&m.text.includes('synthetic-slate-independent'))).toHaveLength(1);
  expect((await h.destination(unrelated)).state).toBe('connected');
  expect(h.edge.messages.filter(m=>m.provider==='slack'&&m.text.includes('synthetic-slate-independent'))).toHaveLength(1);
  expect(h.nookCalls.every(c=>c.allowed)).toBe(true);
 }finally{h.edge.restore();}
});
