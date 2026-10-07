import {searchKinds} from './search-kinds.mjs';
import assert from 'node:assert/strict';
import {api,actor,rows,q,op,pageFixture} from './support.mjs';
export async function discoveryChecks({r,owner,check}){
 const reader=await actor(r,'discovery-reader'),denied=await actor(r,'discovery-denied');
 const container=await pageFixture(r,'discover-one',{title:'Ranked qualification',body:'unique discovery exact phrase'});
 await pageFixture(r,'discover-two',{title:'Second qualification',body:'unique discovery other text'});await pageFixture(r,'discover-private',{title:'Private classified title',body:'unique discovery hidden text',restricted:true});await pageFixture(r,'discover-draft',{body:'unique discovery draft',lifecycle:'draft'});await pageFixture(r,'discover-archived',{body:'unique discovery archive',lifecycle:'archived'});
 const grant=await api(r,'/api/sharing',owner,{operationKey:op(),targetKind:'container',targetId:container,principalKind:'member',principalId:'discovery-reader',level:'view'});assert.equal(grant.status,200);
 await check(['SEARCH-001','SEARCH-002','SEARCH-003','SEARCH-005','SEARCH-008','SEARCH-009'],'search-rank-phrase-filters-ACL-and-defaults',async()=>{
 const res=await api(r,'/api/search?q=unique%20discovery&limit=1',reader);assert.equal(res.status,200);assert.equal(res.data.total,2);assert.equal(res.data.items.length,1);assert.equal(JSON.stringify(res.data).includes('Private classified'),false);assert.equal((await api(r,'/api/search?q=unique%20discovery',denied)).data.total,0);
 const cursor=res.data.nextCursor;await pageFixture(r,'discover-arrival',{body:'unique discovery late arrival'});const next=await api(r,'/api/search?q=unique%20discovery&limit=1&cursor='+encodeURIComponent(cursor),reader);assert.equal(next.data.total,2);assert.notEqual(next.data.items[0].id,res.data.items[0].id);
 const phrase=await api(r,'/api/search?q=%22exact%20phrase%22',reader);assert.equal(phrase.data.total,1);assert.ok(phrase.data.items[0].snippet.includes('exact phrase'));assert.deepEqual(phrase.data.items[0].highlights,['exact phrase']);
 assert.equal((await api(r,'/api/search?q=%22phrase%20exact%22',reader)).data.total,0);
 assert.equal((await api(r,'/api/search?q=unique%20discovery&includeArchived=true',reader)).data.total,4);
 for(const filter of ['kind=page','containerId='+container,'contributorId=qualification-owner','updatedFrom=2020-01-01T00:00:00Z']){const result=await api(r,'/api/search?q=unique%20discovery&'+filter,reader);assert.equal(result.data.total,3);assert.ok(Object.keys(result.data.filters).length>0);}
 assert.equal((await api(r,'/api/search?q=unique%20discovery&updatedTo=2000-01-01T00:00:00Z',reader)).data.total,0);assert.equal((await api(r,'/api/search?q=unique%20discovery&status=missing',reader)).data.total,0);
 });
 await check(['SEARCH-004'],'committed-edit-visible-within-five-seconds',async()=>{
 const current=await api(r,'/api/pages/discover-one',owner);
 const revision=current.data.page.revisionId;
 const updated=await api(r,'/api/pages/discover-one',owner,{operationKey:op(),expectedRevisionId:revision,properties:{title:'Freshness sentinel'}},'PATCH');
 assert.equal(updated.status,200,JSON.stringify(updated.data));const start=performance.now();assert.equal((await api(r,'/api/search?q=Freshness%20sentinel',reader)).data.total,1);assert.ok(performance.now()-start<5000);
 });
 await check(['SEARCH-001','SEARCH-008'],'ordinary-local-search-p95-under-500ms',async()=>{
 const times=[];for(let i=0;i<20;i++){const result=await api(r,'/api/search?q=unique&kind=page',reader);assert.equal(result.status,200);times.push(result.ms);}times.sort((a,b)=>a-b);assert.ok(times[18]<500,JSON.stringify(times));
 });
 await check(['NOTIF-001','NOTIF-002'],'inbox-audience-read-archive-and-private-filter',async()=>{
 const now=new Date().toISOString();await r.sql(`INSERT INTO comment_threads(id,workspace_id,page_id,kind,created_at,updated_at,revision_id) VALUES('thread-fixture','qualification-workspace','discover-one','page',${q(now)},${q(now)},'thread-fixture-rev'); INSERT INTO comments(id,thread_id,author_member_id,body_json,created_at,updated_at,revision_id) VALUES('comment-fixture','thread-fixture','qualification-owner','{}',${q(now)},${q(now)},'comment-fixture-rev');`);await r.sql(['notice-direct','notice-watched','notice-private'].map((id,i)=>`INSERT INTO notifications(id,workspace_id,recipient_member_id,event,source_page_id,comment_id,detail_json,created_at,audience) VALUES(${q(id)},'qualification-workspace','discovery-reader','mention',${q(i===2?'discover-private':'discover-one')},'comment-fixture','{}',${q(now)},${q(i===1?'watched':'direct')})`).join(';')+';');
 const inbox=await api(r,'/api/notifications',reader);assert.equal(inbox.data.items.filter(x=>x.id.startsWith('notice-')).length,2);assert.equal(inbox.data.items.some(x=>x.id==='notice-private'),false);
 assert.equal((await api(r,'/api/notifications?audience=watched',reader)).data.items.length,1);
 const read=await api(r,'/api/notifications/actions',reader,{operationKey:op(),action:'read',id:'notice-direct'});assert.equal(read.status,200);assert.match(read.data.value.href,/comment=comment-fixture/);
 await api(r,'/api/notifications/actions',reader,{operationKey:op(),action:'read-all'});await api(r,'/api/notifications/actions',reader,{operationKey:op(),action:'archive-read'});
 assert.equal((await api(r,'/api/notifications',reader)).data.items.length,0);assert.equal((await api(r,'/api/notifications?archived=true',reader)).data.items.filter(x=>x.id.startsWith('notice-')).length,2);
 });
 await check(['ACT-001','ACT-002','ACT-003','ACT-005','BASE-OPS-005'],'audit-group-mutations-actor-time-survive-group-delete-and-stay-immutable',async()=>{
 const activity=await api(r,'/api/activity?kind=group',owner);assert.equal(activity.status,200);assert.ok(activity.data.items.length>=3);assert.ok(activity.data.items.every(item=>item.actor?.id==='qualification-owner'&&Number.isFinite(Date.parse(item.occurredAt))&&['group.save','group.delete'].includes(item.action)));assert.deepEqual(activity.data.items.map(item=>item.action).sort(),['group.delete','group.save','group.save']);for(const id of new Set(activity.data.items.map(item=>item.target.id)))assert.equal((await rows(r,`SELECT count(*) n FROM groups WHERE id=${q(id)}`))[0].n,0);
 const before=await rows(r,'SELECT count(*) n FROM activity_entries');const update=await api(r,'/api/activity/'+activity.data.items[0].id,owner,{action:'erase'},'DELETE');assert.equal(update.status,404);assert.deepEqual(await rows(r,'SELECT count(*) n FROM activity_entries'),before);
 for(const query of ['actorId=qualification-owner','action=group.save','kind=group','from=2020-01-01T00:00:00Z'])assert.equal((await api(r,'/api/activity?'+query,owner)).status,200);
 });
 await searchKinds({r,owner,reader,container,check});
 await check(['SEARCH-005','NOTIF-001'],'later-read-revocation-removes-all-disclosure',async()=>{
 const grants=await rows(r,`SELECT id FROM container_grants WHERE principal_id='discovery-reader' AND container_id=${q(container)}`);assert.equal(grants.length,1);
 const revoke=await api(r,'/api/sharing',owner,{operationKey:op(),targetKind:'container',targetId:container,id:grants[0].id,principalKind:'member',principalId:'discovery-reader',level:'view',revoke:true});assert.equal(revoke.status,200);
 assert.equal((await api(r,'/api/search?q=unique',reader)).data.total,0);assert.equal((await api(r,'/api/notifications?archived=true',reader)).data.items.length,0);assert.equal((await api(r,'/api/analytics?pageId=discover-one',reader)).status,404);
 });
}
