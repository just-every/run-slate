import test from 'node:test';
import assert from 'node:assert/strict';
import {tsImport} from 'tsx/esm/api';
import {harness} from './harness.mjs';
const {deliverChat,reconcileChat}=await tsImport('../../../src/core/features/notifications/chat-delivery.ts',import.meta.url);
const {connectChat}=await tsImport('../../../src/core/features/notifications/chat-config.ts',import.meta.url);
const {createComment}=await tsImport('../../../src/core/features/comments/service.ts',import.meta.url);
const {notificationStatements}=await tsImport('../../../src/core/features/notifications/events.ts',import.meta.url);
const {ChatProviderError}=await tsImport('../../../src/core/features/notifications/slack.ts',import.meta.url);
const secret='synthetic-test-credential-key-with-at-least-32-characters';
function context(h){return {db:h.db,files:{},jobs:{send:async()=>{}},actor:{id:'owner',workspaceId:'w',role:'owner',email:'owner@example.test',displayName:'owner',initials:'ow',workspaceName:'test'},now:h.now};}
const adapter={audience:async()=>({emails:['reader@example.test'],teamId:'TTEST'}),send:async()=> 'receipt',findReceipt:async()=>null};
const config={credentialKey:secret,appUrl:'https://slate.example.test',adapter};
test('[NOTIF-001][COMM-003] creation snapshot rejects later access, allows atomic new grants, preserves prompt real comment delivery',async()=>{const h=await harness();try{
 await h.page('p','Page');const ctx=context(h);
 await h.db.batch(notificationStatements(ctx,{id:'old-notice',event:'mention',pageId:'p',recipientIds:['denied']}));
 await h.db.prepare("INSERT INTO page_grants(id,page_id,principal_kind,principal_id,level,created_at,updated_at) VALUES('new-grant','p','member','denied','view',?,?)").bind(h.now,h.now).run();
 await h.request('/test/drain','owner',{});assert.equal((await h.request('/api/notifications','denied')).body.items.length,0);
 await h.db.prepare("DELETE FROM page_grants WHERE id='new-grant'").run();
 await h.db.batch([h.db.prepare("INSERT INTO page_grants(id,page_id,principal_kind,principal_id,level,created_at,updated_at) VALUES('atomic-grant','p','member','denied','view',?,?)").bind(h.now,h.now),...notificationStatements(ctx,{id:'atomic-notice',event:'access-granted',pageId:'p',recipientIds:['denied']})]);
 await h.request('/test/drain','owner',{});assert.equal((await h.request('/api/notifications','denied')).body.items.length,1);
 let queued=0;ctx.jobs={send:async()=>{queued++}};await createComment(ctx,'p',{operationKey:'prompt-comment-1',body:[{text:'hello',mention:{kind:'person',id:'reader'}}]});
 assert.ok((await h.request('/api/notifications','reader')).body.items.some(x=>x.event==='mention'));assert.equal(queued,1);
 const entry=await h.db.prepare("SELECT detail_json FROM activity_entries WHERE action='comments.create'").first();assert.ok(JSON.parse(entry.detail_json).commentId);
 }finally{await h.close();}});
test('[NOTIF-002] last claim rejects owner demotion during audience request and reconcile updates health without resending',async()=>{const h=await harness();try{
 await h.page('p','Page');const ctx=context(h);await connectChat(ctx,config,{operationKey:'connect-race',channel:'GTEST',token:'secret',events:['mention']});
 await h.db.batch(notificationStatements(ctx,{id:'race',event:'mention',pageId:'p',recipientIds:['reader']}));await h.request('/test/drain','owner',{});let sends=0;
 await deliverChat(ctx,{...config,adapter:{...adapter,audience:async()=>{await h.db.prepare("UPDATE members SET role='member' WHERE id='owner'").run();return adapter.audience();},send:async()=>{sends++;return 'bad'}}});assert.equal(sends,0);
 await h.db.prepare("UPDATE members SET role='owner' WHERE id='owner'").run();await h.db.prepare("UPDATE chat_deliveries SET state='uncertain'").run();
 await reconcileChat(ctx,{...config,adapter:{...adapter,findReceipt:async()=> 'confirmed'}});let c=await h.db.prepare('SELECT last_delivered_at,last_delivery_event FROM chat_connections').first();assert.equal(c.last_delivery_event,'mention');assert.ok(c.last_delivered_at);
 await h.db.prepare("UPDATE chat_deliveries SET state='uncertain'").run();await reconcileChat(ctx,{...config,adapter:{...adapter,findReceipt:async()=>{throw new ChatProviderError('token_revoked',false,false,true)}}});c=await h.db.prepare('SELECT state,needs_attention_reason FROM chat_connections').first();assert.equal(c.state,'needs-attention');assert.equal(c.needs_attention_reason,'token_revoked');assert.equal(sends,0);
 }finally{await h.close();}});
test('[ACT-003][ACT-004][WORK-007][BASE-INPUT-001] retained comment context filters and names, erased explanations, complete preferences CAS boundary',async()=>{const h=await harness();try{
 await h.page('p','Page');const ctx=context(h);const comment=await createComment(ctx,'p',{operationKey:'context-comment',body:[{text:'hello'}]});
 let list=await h.request('/api/activity?containerId=c','reader');assert.ok(list.body.items.some(x=>x.context.commentId===comment.value.id));
 await h.db.prepare("UPDATE members SET status='removed' WHERE id='owner'").run();list=await h.request('/api/activity?containerId=c','reader');assert.equal(list.body.items.find(x=>x.context.commentId===comment.value.id).actor.displayName,'owner');
 await h.db.prepare("UPDATE pages SET deleted_at=? WHERE id='p'").bind(h.now).run();list=await h.request('/api/activity?containerId=c','reader');const erased=list.body.items.find(x=>x.target.id===comment.value.threadId);assert.equal(erased.deleted,true);assert.equal(erased.actor,null);assert.deepEqual(erased.context,{});assert.ok(erased.explanation);
 const value={sidebarCollapsed:false,quietRoutine:true,collapsedContainers:[],timezone:'UTC'};let response=await h.request('/api/navigation/preferences','reader',{operationKey:'prefs-missing-revision',value},'PUT');assert.equal(response.status,400);
 response=await h.request('/api/navigation/preferences','reader',{operationKey:'prefs-first-revision',expectedRevisionId:null,value},'PUT');assert.equal(response.status,200);response=await h.request('/api/navigation/preferences','reader',{operationKey:'prefs-stale-revision',expectedRevisionId:null,value},'PUT');assert.equal(response.status,409);
 }finally{await h.close();}});
