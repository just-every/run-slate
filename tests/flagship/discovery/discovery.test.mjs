import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './harness.mjs';
test('Discovery HTTP: denied records, exact phrases, current metadata, stable cursors, personal state and ACL revocation',async()=>{
 const h=await harness();try{
  await h.page('visible','Visible reference','alpha beta exact phrase');await h.page('private','Secret title','alpha beta',{restricted:true,status:'secret-status'});await h.page('draft','Draft secret','alpha beta',{lifecycle:'draft'});await h.page('archived','Archived reference','alpha beta',{lifecycle:'archived',archivedAt:h.now});await h.page('second','Second reference','alpha beta');
  assert.equal((await h.request('/api/search?q=alpha',null)).status,401);assert.equal((await h.request('/api/search?q=alpha','denied')).body.total,0);
  const first=await h.request('/api/search?q=alpha&limit=1');assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.total,2);assert.equal(JSON.stringify(first.body).includes('Secret'),false);assert.equal(first.body.facets.status['secret-status'],undefined);
  await h.page('arrival','Arrival','alpha beta');const second=await h.request(`/api/search?q=alpha&limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`);assert.equal(second.body.total,2);assert.notEqual(second.body.items[0].id,first.body.items[0].id);
  assert.equal((await h.request('/api/search?q=%22exact%20phrase%22')).body.total,1);assert.equal((await h.request('/api/search?q=%22phrase%20alpha%22')).body.total,0);assert.equal((await h.request('/api/search?q=alpha&includeArchived=true')).body.total,4);
  const recent=await h.request('/api/navigation/recents','reader',{operationKey:'recent-operation',pageId:'visible'});assert.equal(recent.status,200,JSON.stringify(recent.body));assert.equal((await h.request('/api/navigation','reader')).body.recents.length,1);assert.equal((await h.request('/api/navigation','owner')).body.recents.length,0);
  assert.equal((await h.request('/api/navigation/favourites','reader',{operationKey:'favourite-operation',kind:'page',id:'visible',enabled:true},'PUT')).status,200);
  assert.equal((await h.request('/api/navigation/watches','reader',{operationKey:'watch-operation',pageId:'visible',enabled:true},'PUT')).status,200);
  await h.db.prepare("UPDATE pages SET title='Renamed current' WHERE id='visible'").run();assert.equal((await h.request('/api/search?q=Renamed')).body.items[0].title,'Renamed current');
  await h.db.prepare("UPDATE container_grants SET revoked_at=? WHERE id='cg-reader'").bind(h.now).run();assert.equal((await h.request('/api/search?q=alpha')).body.total,0);assert.deepEqual((await h.request('/api/navigation')).body.favourites,[]);assert.deepEqual((await h.request('/api/navigation')).body.recents,[]);
 }finally{await h.close();}
});
test('Inbox and Today: durable duplicate-safe delivery, mandatory notices, watch recipients, read/archive, revocation after enqueue',async()=>{
 const h=await harness();try{
  await h.page('page','Operational page');
  const emit=async(id,event,recipientIds=['reader'])=>{const result=await h.request('/test/emit','owner',{id,event,pageId:'page',recipientIds,detail:{outcome:`Outcome ${id}`}});assert.equal(result.status,200,JSON.stringify(result.body));};
  await emit('maintenance-one','maintenance');await emit('maintenance-two','maintenance');await emit('mention-one','mention');await emit('decision-one','decision-required');await emit('lapse-one','verification-lapsed');await emit('failure-one','run-failed');await emit('contradiction-one','contradiction');
  await h.request('/test/drain','owner',{});await h.request('/test/drain','owner',{});
  const today=(await h.request('/api/notifications/today')).body;assert.equal(today.outcomes.length,1);assert.equal(today.outcomes[0].count,2);assert.equal(today.decisions.length,1);assert.equal(today.contradictions.length,1);assert.equal(today.notices.length,3);assert.equal(today.unreadCount,7);
  const inbox=(await h.request('/api/notifications?limit=2')).body;assert.equal(inbox.items.length,2);await emit('new-notice','mention');await h.request('/test/drain','owner',{});const next=(await h.request(`/api/notifications?limit=2&cursor=${encodeURIComponent(inbox.nextCursor)}`)).body;assert.equal(next.items.some(i=>inbox.items.some(j=>j.id===i.id)),false);assert.equal(next.items.some(i=>i.id.startsWith('new-notice')),false);
  const open=await h.request('/api/notifications/actions','reader',{operationKey:'read-notice-operation',action:'read',id:inbox.items[0].id});assert.equal(open.status,200,JSON.stringify(open.body));assert.equal(open.body.value.href,'/app/pages/page');
  assert.equal((await h.request('/api/notifications/actions','reader',{operationKey:'read-all-operation',action:'read-all'})).status,200);assert.equal((await h.request('/api/notifications')).body.unreadCount,0);
  await emit('revoked-event','mention');await h.db.prepare("UPDATE container_grants SET revoked_at=? WHERE id='cg-reader'").bind(h.now).run();await h.request('/test/drain','owner',{});assert.equal((await h.request('/api/notifications')).body.unreadCount,0);assert.equal((await h.request('/api/notifications')).body.items.length,0);assert.equal((await h.db.prepare("SELECT count(*) AS n FROM notifications WHERE outbox_id='revoked-event'").first()).n,0);
 }finally{await h.close();}
});
test('Analytics aggregate readable pages only and hide guest identities; activity filters and pagination retain ACL',async()=>{
 const h=await harness();try{
  await h.page('page','Readable');await h.page('private','Private',{},{restricted:true});
  const view=await h.request('/api/analytics/views','reader',{operationKey:'record-view-operation',pageId:'page'});assert.equal(view.status,200,JSON.stringify(view.body));await h.request('/api/analytics/views','reader',{operationKey:'record-view-operation',pageId:'page'});
  let stats=await h.request('/api/analytics?pageId=page');assert.equal(stats.body.totalViews,1);assert.equal(stats.body.uniqueViewers,1);assert.equal((await h.request('/api/analytics?pageId=private')).status,404);
  await h.db.prepare("INSERT INTO page_views VALUES('pv-private','w','private','c','owner','member',1,?)").bind(h.now).run();await h.db.prepare("INSERT INTO page_views VALUES('pv-guest','w','page','c','guest','guest',0,?)").bind(h.now).run();stats=await h.request('/api/analytics?containerId=c');assert.equal(stats.body.totalViews,2);assert.equal(stats.body.viewers.some(r=>r.id==='guest'),false);
  for(const [id,target]of [['a1','page'],['a2','page'],['a3','private']])await h.db.prepare("INSERT INTO activity_entries(id,workspace_id,actor_member_id,feature,action,target_kind,target_id,detail_json,occurred_at) VALUES(?,'w','owner','pages','pages.edit','page',?,'{}',?)").bind(id,target,h.now).run();
  const activity=(await h.request('/api/activity?kind=page&limit=1')).body;assert.equal(activity.items.length,1);const next=(await h.request(`/api/activity?kind=page&limit=1&cursor=${encodeURIComponent(activity.nextCursor)}`)).body;assert.equal(next.items.length,1);assert.notEqual(next.items[0].id,activity.items[0].id);assert.equal(JSON.stringify(activity).includes('private'),false);
 }finally{await h.close();}
});
test('Chat stores encrypted secrets, avoids duplicate and uncertain sends, reports provider auth failure and stops disconnects',async()=>{
 const h=await harness();try{
  await h.page('page','Chat subject');const connection=await h.request('/test/chat','owner',{operationKey:'chat-connect-operation',channel:'GTEST',token:'secret-provider-token',events:['mention']});assert.equal(connection.status,200,JSON.stringify(connection.body));const id=connection.body.value.id;
  const stored=await h.db.prepare('SELECT credential_ciphertext FROM chat_connections WHERE id=?').bind(id).first();assert.ok(stored.credential_ciphertext.startsWith('v1.'));assert.equal(stored.credential_ciphertext.includes('secret-provider-token'),false);assert.equal(JSON.stringify((await h.request('/api/notifications/chat','owner')).body).includes('ciphertext'),false);
  const emit=async id=>{await h.request('/test/emit','owner',{id,event:'mention',pageId:'page',recipientIds:['reader']});await h.request('/test/drain','owner',{});};
  await emit('chat-first');assert.equal((await h.request('/test/deliver/ok','owner',{})).body.sends,1);assert.equal((await h.request('/test/deliver/ok','owner',{})).body.sends,1);
  await emit('chat-uncertain');assert.equal((await h.request('/test/deliver/uncertain','owner',{})).body.sends,2);assert.equal((await h.request('/test/deliver/ok','owner',{})).body.sends,2);assert.equal((await h.db.prepare("SELECT state FROM chat_deliveries WHERE outbox_id='chat-uncertain'").first()).state,'uncertain');
  await emit('chat-revoked');await h.db.prepare("UPDATE container_grants SET revoked_at=? WHERE id='cg-reader'").bind(h.now).run();assert.equal((await h.request('/test/deliver/ok','owner',{})).body.sends,2);assert.equal((await h.db.prepare("SELECT state FROM chat_deliveries WHERE outbox_id='chat-revoked'").first()).state,'cancelled');
  await h.db.prepare("UPDATE container_grants SET revoked_at=NULL WHERE id='cg-reader'").run();await emit('chat-auth');await h.request('/test/deliver/auth','owner',{});assert.equal((await h.db.prepare('SELECT state FROM chat_connections WHERE id=?').bind(id).first()).state,'needs-attention');
  const disconnected=await h.request(`/api/notifications/chat/${id}`,'owner',{operationKey:'chat-disconnect-operation',expectedRevisionId:connection.body.value.revisionId},'DELETE');assert.equal(disconnected.status,200,JSON.stringify(disconnected.body));assert.equal((await h.db.prepare('SELECT credential_ciphertext FROM chat_connections WHERE id=?').bind(id).first()).credential_ciphertext,null);
 }finally{await h.close();}
});
test('SEARCH-001/008 populated mixed-ACL p95 stays below 500ms without AI',async t=>{
 const h=await harness();try{
  for(let i=0;i<160;i++)await h.page(`load-${i}`,`Load ${i}`,'measured lexical match',{restricted:i%2===0,status:i%2===0?'private-status':'public-status'});
  const times=[];for(let i=0;i<22;i++){const start=performance.now();const result=await h.request('/api/search?q=measured&limit=20');const ms=performance.now()-start;assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.total,80);assert.equal(result.body.facets.status['private-status'],undefined);if(i>1)times.push(ms);}
  times.sort((a,b)=>a-b);const p95=times[Math.ceil(times.length*.95)-1];t.diagnostic(`160 pages (80 readable,80 denied),20 measured queries; p95=${p95.toFixed(1)}ms; max=${times.at(-1).toFixed(1)}ms`);assert.ok(p95<500,`Measured p95 ${p95} exceeds500ms`);
 }finally{await h.close();}
});
test('Current published text, every lexical kind, field boundaries, saved-search replay/CAS and invalid sessions',async()=>{
 const h=await harness();try{
  await h.page('page','Working confidential','working secret');await h.db.prepare("INSERT INTO page_revisions(id,page_id,author_member_id,origin,content_hash,body_json,properties_json,created_at) VALUES('published','page','owner','publish','hash',?,?,?)").bind(JSON.stringify([{content:{text:[{text:'Published '},{text:'phrase'}]}}]),JSON.stringify({title:'Public title',statusKey:null}),h.now).run();await h.db.prepare("UPDATE pages SET published_revision_id='published',lifecycle='live-with-unpublished-changes' WHERE id='page'").run();
  assert.equal((await h.request('/api/search?q=confidential')).body.total,0);assert.equal((await h.request('/api/search?q=secret')).body.total,0);assert.equal((await h.request('/api/search?q=%22Published%20phrase%22')).body.total,1);assert.equal((await h.request('/api/search?q=confidential','owner')).body.total,1);
  await h.page('boundary','last title','first body');assert.equal((await h.request('/api/search?q=%22title%20first%22')).body.total,0);
  await h.db.prepare("INSERT INTO knowledge_templates(id,workspace_id,title,description,category,snapshot_json,created_at,updated_at,revision_id) VALUES('template','w','Template special','description special','General','{}',?,?,'template-rev')").bind(h.now,h.now).run();assert.equal((await h.request('/api/search?q=special&kind=template')).body.total,1);
  await h.db.prepare("INSERT INTO comment_threads(id,workspace_id,page_id,kind,created_at,updated_at,revision_id) VALUES('thread','w','page','page',?,?,'thread-rev')").bind(h.now,h.now).run();await h.db.prepare("INSERT INTO comments(id,thread_id,author_member_id,body_json,created_at,updated_at,revision_id) VALUES('comment','thread','owner',?,?,?,'comment-rev')").bind(JSON.stringify([{text:'comment phrase'}]),h.now,h.now).run();assert.equal((await h.request('/api/search?q=%22comment%20phrase%22&kind=comment-thread')).body.total,1);
  await h.page('trash','Trashed page','trashed exact',{trashedAt:h.now});assert.equal((await h.request('/api/search?q=trashed')).body.total,0);assert.equal((await h.request('/api/search?q=trashed&includeTrashed=true')).body.total,1);
  const save={operationKey:'saved-search-operation',name:'My search',query:{query:'phrase'}};const first=await h.request('/api/search/saved','reader',save);assert.equal(first.status,200,JSON.stringify(first.body));assert.deepEqual((await h.request('/api/search/saved','reader',save)).body,first.body);assert.equal((await h.request('/api/search/saved','reader',{...save,name:'Changed'})).status,409);assert.equal((await h.request('/api/search/saved','owner')).body.items.length,0);
  const saved=first.body.value;assert.equal((await h.request('/api/search/saved','reader',{operationKey:'saved-update-operation',id:saved.id,expectedRevisionId:'stale',name:'Updated',query:{query:'changed'}})).status,409);
  const del={operationKey:'saved-delete-operation',expectedRevisionId:saved.revisionId};const deleted=await h.request(`/api/search/saved/${saved.id}`,'reader',del,'DELETE');assert.equal(deleted.status,200);assert.deepEqual((await h.request(`/api/search/saved/${saved.id}`,'reader',del,'DELETE')).body,deleted.body);
  await h.db.prepare("UPDATE sessions SET expires_at='2000-01-01T00:00:00Z' WHERE member_id='reader'").run();for(const path of ['/api/search','/api/navigation','/api/notifications','/api/activity','/api/analytics?pageId=page'])assert.equal((await h.request(path)).status,401);
  await h.db.prepare("UPDATE sessions SET expires_at='2099-01-01T00:00:00Z',revoked_at=? WHERE member_id='reader'").bind(h.now).run();assert.equal((await h.request('/api/search')).status,401);
  await h.db.prepare("UPDATE sessions SET revoked_at=NULL WHERE member_id='reader'").run();await h.db.prepare("UPDATE members SET status='removed' WHERE id='reader'").run();assert.equal((await h.request('/api/search')).status,401);
 }finally{await h.close();}
});
test('Record field search excludes denied relation targets and searches actual retained values',async()=>{
 const h=await harness();try{
  await h.page('db-page','Database');await h.page('record','Record');await h.page('secret-related-id','Private related','hidden',{restricted:true});await h.db.prepare("UPDATE pages SET page_kind='record',database_id='database' WHERE id='record'").run();
  await h.db.prepare("INSERT INTO databases(id,page_id,workspace_id,created_at,updated_at,revision_id) VALUES('database','db-page','w',?,?,'db-rev')").bind(h.now,h.now).run();
  for(const [id,type,pos] of [['text-field','text',0],['relation-field','relation',1]])await h.db.prepare("INSERT INTO database_fields(id,database_id,name,field_type,config_json,position,created_at,updated_at,revision_id) VALUES(?,'database',?,?,'{}',?,?,?,?)").bind(id,id,type,pos,h.now,h.now,`${id}-rev`).run();
  await h.db.prepare("INSERT INTO database_records(page_id,database_id,field_values_json,created_at,updated_at,revision_id) VALUES('record','database',?,?,?,'record-rev')").bind(JSON.stringify({'text-field':'unique field content','relation-field':['secret-related-id']}),h.now,h.now).run();
  assert.equal((await h.request('/api/search?q=%22unique%20field%20content%22&kind=record')).body.total,1);assert.equal((await h.request('/api/search?q=secret-related-id')).body.total,0);
 }finally{await h.close();}
});
test('Transient chat failures are bounded, uncertain writes reconcile without resend, and disconnected work is cancelled',async()=>{
 const h=await harness();try{
  await h.page('page','Chat retry subject');const connected=await h.request('/test/chat','owner',{operationKey:'chat-retry-connect',channel:'GTEST',token:'secret-provider-token',events:['mention']});assert.equal(connected.status,200,JSON.stringify(connected.body));
  const emit=async id=>{assert.equal((await h.request('/test/emit','owner',{id,event:'mention',pageId:'page',recipientIds:['reader']})).status,200);assert.equal((await h.request('/test/drain','owner',{})).status,200);};
  await emit('retry-event');for(let i=0;i<3;i++){const r=await h.request('/test/deliver/transient','owner',{});assert.equal(r.status,200,JSON.stringify(r.body));await h.db.prepare("UPDATE chat_deliveries SET next_attempt_at='2000-01-01T00:00:00.000Z' WHERE outbox_id='retry-event'").run();}
  const retry=await h.db.prepare("SELECT state,attempts FROM chat_deliveries WHERE outbox_id='retry-event'").first();assert.deepEqual(retry,{state:'failed',attempts:3});
  await emit('reconcile-event');await h.request('/test/deliver/uncertain','owner',{});const before=(await h.request('/test/deliver/ok','owner',{})).body.sends;assert.equal((await h.request('/test/reconcile','owner',{})).body.reconciled,1);assert.equal((await h.request('/test/deliver/ok','owner',{})).body.sends,before);assert.equal((await h.db.prepare("SELECT provider_receipt FROM chat_deliveries WHERE outbox_id='reconcile-event'").first()).provider_receipt,'read-back-receipt');
  await emit('cancel-event');assert.equal((await h.request(`/api/notifications/chat/${connected.body.value.id}`,'owner',{operationKey:'chat-retry-disconnect',expectedRevisionId:connected.body.value.revisionId},'DELETE')).status,200);assert.equal((await h.request('/test/deliver/ok','owner',{})).body.sends,before);assert.equal((await h.db.prepare("SELECT state FROM chat_deliveries WHERE outbox_id='cancel-event'").first()).state,'cancelled');
 }finally{await h.close();}
});
test('Migration 0005 preserves prior personal and notification records',async()=>{
 const old='2026-09-01T00:00:00.000Z';const h=await harness({beforeDiscovery:async db=>{
  await db.prepare("INSERT INTO workspaces(id,name,mark,created_at,updated_at,revision_id) VALUES('old-w','Old workspace','O',?,?,'old-r')").bind(old,old).run();await db.prepare("INSERT INTO members(id,workspace_id,email,display_name,initials,role,created_at,updated_at) VALUES('old-member','old-w','old@example.test','Old','O','owner',?,?)").bind(old,old).run();await db.prepare("INSERT INTO notifications(id,workspace_id,recipient_member_id,event,detail_json,created_at) VALUES('old-notice','old-w','old-member','access-granted','{}',?)").bind(old).run();
 }});try{const row=await h.db.prepare("SELECT id,event,created_at,outbox_id,audience FROM notifications WHERE id='old-notice'").first();assert.deepEqual(row,{id:'old-notice',event:'access-granted',created_at:old,outbox_id:null,audience:'direct'});}finally{await h.close();}
});
test('Erased activity is a content-free explanation only for current retained readers',async()=>{
 const h=await harness();try{
  await h.page('gone','Erased private body');await h.page('private-gone','Unknown erased','hidden',{restricted:true});for(const id of ['gone','private-gone']){await h.db.prepare('UPDATE pages SET deleted_at=? WHERE id=?').bind(h.now,id).run();await h.db.prepare("INSERT INTO activity_entries(id,workspace_id,actor_member_id,feature,action,target_kind,target_id,detail_json,occurred_at) VALUES(?,'w','owner','pages','pages.delete','page',?,'{}',?)").bind(`${id}-activity`,id,h.now).run();}
  const result=await h.request('/api/activity?kind=page');assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.items.length,1);assert.equal(result.body.items[0].deleted,true);assert.equal(result.body.items[0].actor,null);assert.deepEqual(result.body.items[0].context,{});assert.equal(JSON.stringify(result.body).includes('Erased private body'),false);
  await h.db.prepare("UPDATE container_grants SET revoked_at=? WHERE id='cg-reader'").bind(h.now).run();assert.equal((await h.request('/api/activity?kind=page')).body.items.length,0);
 }finally{await h.close();}
});
test('Public view counters revalidate exposure and anonymous vetoes without storing visitor identity',async()=>{
 const h=await harness();try{
  await h.page('page','Public page');await h.db.prepare("INSERT INTO page_revisions(id,page_id,author_member_id,origin,content_hash,body_json,properties_json,created_at) VALUES('page-rev','page','owner','publish','hash','[]','{}',?)").bind(h.now).run();await h.db.prepare("INSERT INTO public_exposures(id,page_id,host,slug,published_at) VALUES('exposure','page','public.example.test','page',?)").bind(h.now).run();
  const input={viewId:'public-view-one',pageId:'page',host:'public.example.test',slug:'page',now:h.now};assert.equal((await h.request('/test/public-view','owner',input)).status,200);await h.request('/test/public-view','owner',input);assert.equal((await h.request('/api/analytics?pageId=page')).body.anonymousViews,1);
  await h.db.prepare("UPDATE containers SET anonymous_access='forbidden' WHERE id='c'").run();await h.request('/test/public-view','owner',{...input,viewId:'blocked-view'});assert.equal((await h.request('/api/analytics?pageId=page')).body.anonymousViews,1);assert.equal((await h.db.prepare("SELECT viewer_member_id FROM page_views WHERE id='public-view-one'").first()).viewer_member_id,null);
 }finally{await h.close();}
});
test('Watch recipients are captured atomically at the event, exclude own actions and retain separate inbox views',async()=>{
 const h=await harness();try{
  await h.page('page','Watched page');assert.equal((await h.request('/api/navigation/watches','reader',{operationKey:'watch-before-event',pageId:'page',enabled:true},'PUT')).status,200);
  await h.request('/test/emit','owner',{id:'watched-comment',event:'comment',pageId:'page'});
  await h.db.prepare("INSERT INTO container_grants(id,container_id,principal_kind,principal_id,level,created_at,updated_at) VALUES('late-grant','c','member','denied','view',?,?)").bind(h.now,h.now).run();await h.request('/api/navigation/watches','denied',{operationKey:'watch-after-event',pageId:'page',enabled:true},'PUT');await h.request('/test/drain','owner',{});
  assert.equal((await h.request('/api/notifications?audience=watched','reader')).body.items.length,1);assert.equal((await h.request('/api/notifications?audience=direct','reader')).body.items.length,0);assert.equal((await h.request('/api/notifications','denied')).body.items.length,0);assert.equal((await h.request('/api/notifications','owner')).body.items.length,0);
  assert.equal((await h.request('/api/notifications/actions','reader',{operationKey:'archive-unread-notice',action:'archive-read'})).body.value.changed,0);await h.request('/api/notifications/actions','reader',{operationKey:'read-before-archive',action:'read-all'});assert.equal((await h.request('/api/notifications/actions','reader',{operationKey:'archive-read-notice',action:'archive-read'})).body.value.changed,1);assert.equal((await h.request('/api/notifications?archived=true','reader')).body.items.length,1);
 }finally{await h.close();}
});
test('Routine chat coalesces into one daily digest while mentions remain immediate',async()=>{
 const h=await harness();try{
  await h.page('page','Digest subject');assert.equal((await h.request('/test/chat','owner',{operationKey:'chat-digest-connect',channel:'GTEST',token:'test-token',events:['maintenance','mention']})).status,200);
  for(const id of ['routine-a','routine-b'])await h.request('/test/emit','owner',{id,event:'maintenance',pageId:'page',recipientIds:['reader'],detail:{outcome:'Completed upkeep'}});
  await h.request('/test/drain','owner',{});assert.equal((await h.db.prepare('SELECT count(*) AS n FROM chat_deliveries').first()).n,1);assert.equal((await h.request('/test/deliver/ok','owner',{})).body.sends,0);
  await h.request('/test/emit','owner',{id:'immediate-mention',event:'mention',pageId:'page',recipientIds:['reader']});await h.request('/test/drain','owner',{});assert.equal((await h.request('/test/deliver/ok','owner',{})).body.sends,1);
  await h.db.prepare("UPDATE notification_outbox SET created_at=? WHERE event='maintenance'").bind(new Date(Date.parse(h.now)-86400000).toISOString()).run();assert.equal((await h.request('/test/deliver/ok','owner',{})).body.sends,2);assert.equal((await h.request('/test/deliver/ok','owner',{})).body.sends,2);assert.equal((await h.request('/api/notifications/today')).body.outcomes[0].count,2);
 }finally{await h.close();}
});
