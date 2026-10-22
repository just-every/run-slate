import {env} from 'cloudflare:test';
import {test,expect} from 'vitest';
import {scenario,profile,key,rows} from '../policies/helpers';
import {seedContainer,seedContainerGrant} from '../../e2e/setup/fixtures';
import {createPage,readPage} from '../../../src/core/features/pages/service';
import {cancelSchedule} from '../../../src/core/features/lifecycle/service';
import {publishPage} from './review-helper';
import {publishScheduledPage} from '../../../src/core/features/lifecycle/publication';
import {runContentJobs} from '../../../src/core/features/lifecycle/jobs';
import type {PublicationSchedule} from '../../../src/core/features/lifecycle/publication-input';
import {saveGrant} from '../../../src/core/features/sharing/grants';

test('LIFE-004 durable workspace and container schedules stage privately and fire once with saved choices',async()=>{
 for(const general of ['workspace','container'] as const){
 const {owner,reader,containerId}=await scenario();await profile(owner,{'page.lifecycle.v1':'draft-then-publish','page.version.v1':'labelled','page.access.v1':general==='workspace'?'workspace-general':'container-general'});
 const target=(await seedContainer(owner.actor.workspaceId,{ownerMemberId:owner.actor.id,visibility:'private'})).containerId;
 await seedContainerGrant(target,{principalKind:'member',principalId:owner.actor.id,level:'full'});
 const p=await createPage(owner,{operationKey:key('schedule'),containerId,title:'Future'}),due=new Date(Date.parse(owner.now)+60000).toISOString();
 const destination={containerId:target,parentPageId:null,treePosition:'future-order'},generalAccess={kind:general,level:'view' as const};
 const staged=await publishPage(owner,p.value.pageId,{operationKey:key('staging').padEnd(160,'x'),expectedRevisionId:p.receipt.revisionId,destination,generalAccess,publishAt:due,publishAsMemberId:reader.actor.id,label:'First'});
 expect((await readPage(owner,p.value.pageId)).page).toMatchObject({containerId,lifecycle:'scheduled'});
 expect(await rows("SELECT id FROM page_grants WHERE page_id=? AND principal_kind IN ('workspace','container') AND revoked_at IS NULL",p.value.pageId)).toEqual([]);
 expect(await rows("SELECT id FROM page_revisions WHERE page_id=? AND origin='publish'",p.value.pageId)).toEqual([]);
 await expect(readPage(reader,p.value.pageId)).rejects.toMatchObject({status:404});
 const row=await env.DB.prepare('SELECT * FROM content_schedules WHERE page_id=?').bind(p.value.pageId).first<PublicationSchedule>();
 expect(JSON.parse(row!.publication_json!)).toMatchObject({destination,generalAccess,publishAsMemberId:reader.actor.id,review:{pageId:p.value.pageId,destination}});
 // Reconstitute solely from persisted row and a fresh context: no captured closure or in-memory choice state.
 await publishScheduledPage({...owner,now:due,authorizationEpoch:undefined},JSON.parse(JSON.stringify(row)));
 const result=await readPage({...owner,now:due},p.value.pageId);
 expect(result.page).toMatchObject({containerId:target,lifecycle:'live'});expect(result.properties.byline).toBe('Reader');
 expect(await rows('SELECT state,failure FROM content_schedules WHERE page_id=?',p.value.pageId)).toEqual([{state:'published',failure:null}]);
 expect(await rows("SELECT ordinal,label FROM page_revisions WHERE page_id=? AND origin='publish'",p.value.pageId)).toEqual([{ordinal:1,label:'First'}]);
 await runContentJobs(env,due);
 expect((await readPage(owner,p.value.pageId)).publishedRevisionId).toBe(result.publishedRevisionId);
 expect(staged.receipt.revisionId).not.toBe(result.publishedRevisionId);
 }
});

test('LIFE-004 cancellation wins against a stale loaded job, stays draft and never publishes',async()=>{
 const {owner,containerId}=await scenario();await profile(owner,{'page.lifecycle.v1':'draft-then-publish'});
 const p=await createPage(owner,{operationKey:key('cancel-page'),containerId,title:'Cancel'}),due=new Date(Date.parse(owner.now)+60000).toISOString();
 const scheduled=await publishPage(owner,p.value.pageId,{operationKey:key('cancel-stage'),expectedRevisionId:p.receipt.revisionId,publishAt:due,generalAccess:{kind:'workspace',level:'view'}});
 const row=(await env.DB.prepare('SELECT * FROM content_schedules WHERE page_id=?').bind(p.value.pageId).first<PublicationSchedule>())!;
 await cancelSchedule(owner,p.value.pageId,{operationKey:key('cancel'),expectedRevisionId:scheduled.receipt.revisionId});
 await expect(publishScheduledPage({...owner,now:due},row)).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 await runContentJobs(env,due);
 expect((await readPage(owner,p.value.pageId)).page.lifecycle).toBe('draft');
 expect(await rows("SELECT id FROM page_revisions WHERE page_id=? AND origin='publish'",p.value.pageId)).toEqual([]);
 expect(await rows('SELECT state FROM content_schedules WHERE page_id=?',p.value.pageId)).toEqual([{state:'cancelled'}]);
});

test('LIFE-004 due destination revocation and real SQL failure retain an actionable failed schedule with no partial publish',async()=>{
 const {owner,reader,containerId}=await scenario();await profile(owner,{'page.lifecycle.v1':'draft-then-publish'});
 const target=(await seedContainer(owner.actor.workspaceId,{ownerMemberId:reader.actor.id,visibility:'private'})).containerId;
 const grant=await saveGrant(reader,{operationKey:key('destination-grant'),targetKind:'container',targetId:target,principalKind:'member',principalId:owner.actor.id,level:'edit'});
 const p=await createPage(owner,{operationKey:key('revoke-page'),containerId,title:'Revocation'}),due=new Date(Date.parse(owner.now)+60000).toISOString();
 await publishPage(owner,p.value.pageId,{operationKey:key('revoke-stage'),expectedRevisionId:p.receipt.revisionId,publishAt:due,destination:{containerId:target,parentPageId:null,treePosition:'1'},generalAccess:{kind:'workspace',level:'view'}});
 await saveGrant(reader,{operationKey:key('destination-revoke'),targetKind:'container',targetId:target,id:grant.value.id,principalKind:'member',principalId:owner.actor.id,level:'edit',revoke:true});
 await runContentJobs(env,due);
 expect((await readPage(owner,p.value.pageId)).page).toMatchObject({containerId,lifecycle:'scheduled'});
 expect(await rows('SELECT state,failure FROM content_schedules WHERE page_id=?',p.value.pageId)).toEqual([{state:'failed',failure:'Scheduled publication cannot access the page or destination. Restore access and reschedule.'}]);
 expect(await rows("SELECT id FROM page_revisions WHERE page_id=? AND origin='publish'",p.value.pageId)).toEqual([]);
 const q=await createPage(owner,{operationKey:key('sql-page'),containerId,title:'SQL failure'});
 await publishPage(owner,q.value.pageId,{operationKey:key('sql-stage'),expectedRevisionId:q.receipt.revisionId,publishAt:due,generalAccess:{kind:'workspace',level:'view'}});
 await env.DB.exec("CREATE TRIGGER qualification_scheduled_fail BEFORE INSERT ON content_events WHEN NEW.kind='published' BEGIN SELECT RAISE(ABORT,'durable scheduled SQL failure'); END;");
 try{await runContentJobs(env,due);}finally{await env.DB.exec('DROP TRIGGER qualification_scheduled_fail;');}
 expect((await readPage(owner,q.value.pageId)).page.lifecycle).toBe('scheduled');
 const failed=await rows('SELECT state,failure FROM content_schedules WHERE page_id=?',q.value.pageId);expect(failed[0].state).toBe('failed');expect(failed[0].failure).toContain('durable scheduled SQL failure');
 expect(await rows("SELECT id FROM page_revisions WHERE page_id=? AND origin='publish'",q.value.pageId)).toEqual([]);
});

test('LIFE-004 old saved schedule with null choices preserves its original location and named grants',async()=>{
 const {owner,reader,containerId}=await scenario();await profile(owner,{'page.lifecycle.v1':'draft-then-publish'});
 const p=await createPage(owner,{operationKey:key('legacy'),containerId,title:'Retained legacy'}),due=new Date(Date.parse(owner.now)+60000).toISOString();
 const grant=await saveGrant(owner,{operationKey:key('legacy-named'),targetKind:'page',targetId:p.value.pageId,principalKind:'member',principalId:reader.actor.id,level:'view'});
 await publishPage(owner,p.value.pageId,{operationKey:key('legacy-stage'),expectedRevisionId:p.receipt.revisionId,publishAt:due});
 await env.DB.prepare('UPDATE content_schedules SET publication_json=NULL WHERE page_id=?').bind(p.value.pageId).run();
 const before=await rows('SELECT * FROM page_grants WHERE id=?',grant.value.id);
 await runContentJobs(env,due);
 expect((await readPage(reader,p.value.pageId)).page).toMatchObject({containerId,lifecycle:'live'});
 expect(await rows('SELECT * FROM page_grants WHERE id=?',grant.value.id)).toEqual(before);
});

test('LIFE-004 scheduling a live general grant privately retains its exact grant on fire and honors later revocation',async()=>{
 const {owner,reader,containerId}=await scenario();
 const target=(await seedContainer(owner.actor.workspaceId,{ownerMemberId:owner.actor.id,visibility:'private'})).containerId;
 const p=await createPage(owner,{operationKey:key('live-schedule-page'),containerId,title:'Existing shared page'});
 const grant=await saveGrant(owner,{operationKey:key('live-general'),targetKind:'page',targetId:p.value.pageId,principalKind:'workspace',principalId:owner.actor.workspaceId,level:'view'});
 const due=new Date(Date.parse(owner.now)+60000).toISOString();
 const stage=await publishPage(owner,p.value.pageId,{operationKey:key('live-stage'),expectedRevisionId:p.receipt.revisionId,publishAt:due,destination:{containerId:target,parentPageId:null,treePosition:'moved'}});
 await expect(readPage(reader,p.value.pageId)).rejects.toMatchObject({status:404});
 expect(await rows("SELECT id FROM page_grants WHERE page_id=? AND principal_kind='workspace' AND revoked_at IS NULL",p.value.pageId)).toEqual([]);
 await publishPage(owner,p.value.pageId,{operationKey:key('live-reschedule'),expectedRevisionId:stage.receipt.revisionId,publishAt:due,destination:{containerId:target,parentPageId:null,treePosition:'moved'}});
 await runContentJobs(env,due);
 expect((await readPage(reader,p.value.pageId)).page.containerId).toBe(target);
 expect(await rows('SELECT id,principal_kind,principal_id,level,revoked_at FROM page_grants WHERE id=?',grant.value.id)).toEqual([{id:grant.value.id,principal_kind:'workspace',principal_id:owner.actor.workspaceId,level:'view',revoked_at:null}]);
 const q=await createPage(owner,{operationKey:key('revoked-schedule-page'),containerId,title:'Revoked intended grant'});
 const revoked=await saveGrant(owner,{operationKey:key('revoked-general'),targetKind:'page',targetId:q.value.pageId,principalKind:'workspace',principalId:owner.actor.workspaceId,level:'view'});
 await publishPage(owner,q.value.pageId,{operationKey:key('revoked-stage'),expectedRevisionId:q.receipt.revisionId,publishAt:due});
 // Same timestamp deliberately: the grant's immutable revision, not clock ordering, detects this change.
 await saveGrant(owner,{operationKey:key('explicit-revoke'),targetKind:'page',targetId:q.value.pageId,id:revoked.value.id,principalKind:'workspace',principalId:owner.actor.workspaceId,level:'view',revoke:true});
 await runContentJobs(env,due);
 expect((await readPage(owner,q.value.pageId)).page.lifecycle).toBe('scheduled');
 expect((await rows('SELECT state FROM content_schedules WHERE page_id=?',q.value.pageId))[0].state).toBe('failed');
 await expect(readPage(reader,q.value.pageId)).rejects.toMatchObject({status:404});
});
