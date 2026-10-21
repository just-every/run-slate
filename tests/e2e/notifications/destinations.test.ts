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
 const tokens=['synthetic-slate-101','synthetic-slate-102','synthetic-slate-103','synthetic-slate-104'];
 const secret=crypto.randomUUID(),origin='https://slate.test',key=()=>crypto.randomUUID();
 const bindings:AppBindings={...env,SLATE_PROFILE:undefined,CONNECTOR_CREDENTIALS_KEY:secret,APP_URL:origin};
 const app=createApi(),edge=chatNetwork(tokens,'synthetic-slate-2@example.test');
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
  const ack=vi.fn(),retry=vi.fn();
  await worker.queue!({queue:'synthetic-slate-1',metadata:{metrics:{backlogCount:1,backlogBytes:0}},messages:[{id:key(),body:{type:'discovery.deliver'},timestamp:new Date(),attempts:1,ack,retry}],ackAll:vi.fn(),retryAll:vi.fn()} as MessageBatch<unknown>,runtime);
  expect(retry).not.toHaveBeenCalled();expect(ack).toHaveBeenCalledOnce();
 };
 const events=['published','page-edited','comment','post-published','review-requested','verification-lapsed'];
 const connect=(token:string,provider='slack',channel='GSLATE2',selected=events,scope:string|null=null,actor:keyof typeof cookies='owner')=>api('POST','/api/notifications/chat/destinations',{operationKey:key(),provider,channel,token,events:selected,containerId:scope},actor);
 const reconnect=async(id:string,token:string,actor:keyof typeof cookies='owner')=>{const c=await destination(id);return api('PUT',`/api/notifications/chat/destinations/${id}`,{operationKey:key(),provider:c.provider,containerId:c.containerId,channel:c.destination.slice(c.provider.length+1),token,events:JSON.parse(c.eventsJson),expectedRevisionId:c.revisionId},actor);};
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
  const teams=(await connect(tokens[2]!,'teams','synthetic-slate-5/synthetic-slate-6')).value.id;
  expect((await list('manager')).map(item=>item.id)).toEqual([second]);expect(await list('reader')).toEqual([]);
  expect((await raw('DELETE',`/api/notifications/chat/${teams}`,{operationKey:key(),expectedRevisionId:(await destination(teams)).revisionId},'manager')).status).toBe(403);
  expect((await raw('GET',`/api/notifications/chat/destinations/${teams}/deliveries`,undefined,'manager')).status).toBe(403);
  const ids=[first,second,teams];
  for(const [i,id] of ids.entries()){
   const row=await env.DB.prepare('SELECT * FROM chat_connections WHERE id=?').bind(id).first<any>();
   expect(row.credential_ciphertext).not.toContain(tokens[i]);expect(await decryptSecret(secret,row.credential_ciphertext,chatScope(workspaceId,id,row.provider))).toBe(tokens[i]);
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
  for(const [i,token] of tokens.slice(0,3).entries()){
   const messages=edge.messages.filter(m=>m.token===token);
   expect(messages.map(m=>m.text.split(' · ')[0]).sort()).toEqual((i===1?['comment']:events).toSorted());
   for(const message of messages){expect(message.text.split(' · ')).toHaveLength(4);expect(message.text).toContain('/app/pages/');expect(message.text).not.toContain('private-');}
   expect((await destination(ids[i]!)).lastDeliveredAt).toBeTruthy();
   expect((await history(ids[i]!)).filter((item:any)=>item.state==='delivered')).toHaveLength(i===1?1:events.length);
  }
  // Every audience, including the second Slack destination, fails closed before a send.
  for(const audience of refusals){
   edge.audiences.set(tokens[1]!,audience);const before=edge.messages.filter(m=>m.token===tokens[1]).length;
   await comment();await drain();expect(edge.messages.filter(m=>m.token===tokens[1])).toHaveLength(before);
   expect((await destination(second)).lastFailureReason).toBeTruthy();
  }
  edge.audiences.delete(tokens[1]!);
  edge.teamsMembers.set(tokens[2]!,[{'@odata.type':'#microsoft.graph.aadUserConversationMember'}]);
  const beforeTeams=edge.messages.filter(m=>m.token===tokens[2]).length;await comment();await drain();expect(edge.messages.filter(m=>m.token===tokens[2])).toHaveLength(beforeTeams);edge.teamsMembers.delete(tokens[2]!);
  const beforeDenied=edge.messages.length;
  await comment();await env.DB.prepare('UPDATE container_grants SET revoked_at=? WHERE container_id=? AND principal_id=?').bind(new Date().toISOString(),containerId,reader).run();
  await drain();expect(edge.messages).toHaveLength(beforeDenied);
  expect((await raw('GET',`/api/pages/${pageId}`,undefined,'reader')).status).toBe(404);
  expect((await app.request(origin+`/api/pages/${pageId}`,{},bindings)).status).toBe(401);
  const execution=createExecutionContext(),linked=await handleApplicationRequest(new Request(origin+`/app/pages/${pageId}`),bindings,execution);expect(linked.status).toBe(302);expect(linked.headers.get('location')).toContain('/signin');await waitOnExecutionContext(execution);
  await env.DB.prepare('UPDATE container_grants SET revoked_at=NULL WHERE container_id=? AND principal_id=?').bind(containerId,reader).run();
  // Each provider's transient rejection retries with the same operation key; permanent and uncertain writes do not.
  for(const [i,token] of tokens.slice(0,3).entries()){
   edge.failures.set(token,'transient');await comment();await drain();
   expect((await destination(ids[i]!)).lastFailureReason).toBe('rate_limited');
   const failed=edge.attempts.filter(a=>a.token===token).at(-1)!;
   await env.DB.prepare("UPDATE chat_deliveries SET next_attempt_at='2000-01-01T00:00:00.000Z' WHERE connection_id=? AND state='pending'").bind(ids[i]).run();
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
  // Workspace export retains destination records/history while omitting every credential value.
  const exported=await api('POST','/api/exports/workspace',{operationKey:key()});
  const download=await raw('GET',`/api/exports/${exported.id}/download`);expect(download.status).toBe(200);
  const archive=await decodeArchive(new Uint8Array(await download.arrayBuffer()));
  for(const row of archive.manifest.tables.chat_connections!){expect(row.credential_ciphertext).toBeNull();expect(row.state).toBe('disconnected');}
  for(const token of tokens)expect(JSON.stringify(archive.manifest)).not.toContain(token);
  // A populated v0.4.0-shaped store upgrades additively, keeping its original ID, scope, ciphertext and delivered history.
  const prior=(env as unknown as {PRIOR_DB:D1Database}).PRIOR_DB;
  await applyD1Migrations(prior,env.TEST_MIGRATIONS.filter(m=>m.name<'0045_chat_destinations.sql'));
  for(const table of ['workspaces','members','member_authority','containers','container_owners','container_grants','sessions','pages','page_revisions','page_blocks','content_published_revisions','notification_outbox']){
   const rows=(await env.DB.prepare(`SELECT * FROM ${table}`).all<any>()).results;
   for(const row of rows){const columns=Object.keys(row);await prior.prepare(`INSERT ${table==='content_published_revisions'?'OR IGNORE ':''}INTO ${table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).bind(...Object.values(row)).run();}
  }
  const old=await env.DB.prepare('SELECT * FROM chat_connections WHERE id=?').bind(first).first<any>();delete old.provider;delete old.container_id;
  const columns=Object.keys(old);await prior.prepare(`INSERT INTO chat_connections(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).bind(...Object.values(old)).run();
  const delivered=await env.DB.prepare("SELECT * FROM chat_deliveries WHERE connection_id=? AND state='delivered' LIMIT 1").bind(first).first<any>();
  const dc=Object.keys(delivered);await prior.prepare(`INSERT INTO chat_deliveries(${dc.join(',')}) VALUES(${dc.map(()=>'?').join(',')})`).bind(...Object.values(delivered)).run();
  await applyD1Migrations(prior,env.TEST_MIGRATIONS);
  expect(await prior.prepare('SELECT * FROM chat_connections WHERE id=?').bind(first).first()).toEqual({...old,provider:'slack',container_id:null});
  expect(await prior.prepare('SELECT * FROM chat_deliveries WHERE id=?').bind(delivered.id).first()).toEqual(delivered);
  const upgraded={...bindings,DB:prior};
  expect((await api('GET','/api/notifications/chat',undefined,'owner',upgraded)).connection.id).toBe(first);
  const upgradedSends=edge.messages.filter(m=>m.token===tokens[0]).length;
  await api('POST',`/api/comments/page/${pageId}`,{operationKey:key(),body:[{text:'synthetic-slate-upgrade-body'}]},'owner',upgraded);await drain(upgraded);
  expect(edge.messages.filter(m=>m.token===tokens[0])).toHaveLength(upgradedSends+1);
  console.log('PASS CHAT-001 populated v0.4.0 upgrade through 0045, public legacy route and delivery; export credentials omitted');
  // Erasing the container owner removes that destination's credential and audience references.
  await api('POST','/api/members/remove',{operationKey:key(),memberId:manager,erase:true});
  expect(await env.DB.prepare('SELECT credential_ciphertext,state FROM chat_connections WHERE id=?').bind(second).first()).toEqual({credential_ciphertext:null,state:'disconnected'});
  expect(await env.DB.prepare('SELECT count(*) AS n FROM chat_connections,json_each(audience_member_ids_json) WHERE value=?').bind(manager).first<number>('n')).toBe(0);
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
