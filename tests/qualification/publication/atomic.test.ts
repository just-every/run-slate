import { env } from 'cloudflare:test';
import { test, expect } from 'vitest';
import { scenario, profile, key, rows } from '../policies/helpers';
import { seedContainer, seedContainerGrant } from '../../e2e/setup/fixtures';
import { createPage, readPage } from '../../../src/core/features/pages/service';
import { publishPage } from './review-helper';
import { saveGrant } from '../../../src/core/features/sharing/grants';
import { setSharingConfiguration } from '../../../src/core/features/sharing/configuration';
import { requirePageLevel } from '../../../src/core/features/sharing/current-access';
import { pageRow } from '../../../src/core/features/pages/repository';

test('LIFE-003 SHARE-004/005 atomic location and both general access profiles, named grants, ordinal and replay', async () => {
 for (const access of ['workspace-general', 'container-general'] as const){
 const {owner,reader,containerId}=await scenario();
 await profile(owner,{'page.lifecycle.v1':'draft-then-publish','page.access.v1':access,'page.version.v1':'labelled'});
 const target=(await seedContainer(owner.actor.workspaceId,{ownerMemberId:owner.actor.id,visibility:'private'})).containerId;
 await seedContainerGrant(target,{principalKind:'member',principalId:owner.actor.id,level:'full'});
 const parent=await createPage(owner,{operationKey:key('parent'),containerId:target,title:'Parent'});
 const p=await createPage(owner,{operationKey:key('draft'),containerId,title:'The actual snapshot'});
 const child=await createPage(owner,{operationKey:key('child'),containerId,parentPageId:p.value.pageId,title:'Child'});
 const named=await saveGrant(owner,{operationKey:key('named'),targetKind:'page',targetId:p.value.pageId,principalKind:'member',principalId:reader.actor.id,level:'comment'});
 const namedBefore=await rows('SELECT * FROM page_grants WHERE id=?',named.value.id);
 const input={operationKey:key('publish'),expectedRevisionId:p.receipt.revisionId,label:'Reviewed',publishAsMemberId:reader.actor.id,destination:{containerId:target,parentPageId:parent.value.pageId,treePosition:'0004'},generalAccess:{kind:access==='workspace-general'?'workspace' as const:'container' as const,level:'view' as const}};
 const result=await publishPage(owner,p.value.pageId,input);
 expect(await publishPage(owner,p.value.pageId,input)).toEqual(result);
 await expect(publishPage(owner,p.value.pageId,{...input,label:'Changed'})).rejects.toMatchObject({code:'OPERATION_KEY_CONFLICT'});
 expect(await rows('SELECT * FROM page_grants WHERE id=?',named.value.id)).toEqual(namedBefore);
 expect(await rows("SELECT principal_kind,principal_id,level FROM page_grants WHERE page_id=? AND principal_kind IN ('workspace','container') AND revoked_at IS NULL",p.value.pageId)).toEqual([{principal_kind:input.generalAccess.kind,principal_id:input.generalAccess.kind==='workspace'?owner.actor.workspaceId:target,level:'view'}]);
 expect(await pageRow(owner,p.value.pageId)).toMatchObject({container_id:target,parent_page_id:parent.value.pageId,tree_position:'0004',lifecycle:'live',access_inheritance:'restricted',working_revision_id:result.receipt.revisionId,published_revision_id:result.receipt.revisionId});
 expect((await pageRow(owner,child.value.pageId)).container_id).toBe(target);
 expect(await rows("SELECT origin,ordinal,label FROM page_revisions WHERE page_id=? AND origin='publish'",p.value.pageId)).toEqual([{origin:'publish',ordinal:1,label:'Reviewed'}]);
 expect((await readPage(reader,p.value.pageId)).properties.byline).toBe('Reader');
 expect(await rows("SELECT action FROM activity_entries WHERE operation_key=?",input.operationKey)).toEqual([{action:'pages.publish'}]);
 }
});

test('LIFE-003 restricted publication stops inherited open-container access without losing named grants',async()=>{
 const {owner,reader,outsider,containerId}=await scenario();await profile(owner,{'page.lifecycle.v1':'draft-then-publish'});
 await seedContainerGrant(containerId,{principalKind:'workspace',principalId:owner.actor.workspaceId,level:'edit'});
 const p=await createPage(owner,{operationKey:key('private'),containerId,title:'Named only'});
 await saveGrant(owner,{operationKey:key('named'),targetKind:'page',targetId:p.value.pageId,principalKind:'member',principalId:reader.actor.id,level:'view'});
 const result=await publishPage(owner,p.value.pageId,{operationKey:key('restricted'),expectedRevisionId:p.receipt.revisionId,generalAccess:{kind:'restricted'}});
 expect((await readPage(owner,p.value.pageId)).page.revisionId).toBe(result.receipt.revisionId);
 expect((await readPage(reader,p.value.pageId)).page.title).toBe('Named only');
 await expect(readPage(outsider,p.value.pageId)).rejects.toMatchObject({status:404});
 expect(await rows("SELECT id FROM page_grants WHERE page_id=? AND principal_kind IN ('container','workspace') AND revoked_at IS NULL",p.value.pageId)).toEqual([]);
});

test('LIFE-003 invalid principals, levels, cycles, attribution and source authority write nothing',async()=>{
 const {owner,reader,containerId}=await scenario();await profile(owner,{'page.lifecycle.v1':'draft-then-publish'});
 const p=await createPage(owner,{operationKey:key('validate'),containerId,title:'Validation'});
 await seedContainerGrant(containerId,{principalKind:'member',principalId:reader.actor.id,level:'edit'});
 await saveGrant(owner,{operationKey:key('edit-only'),targetKind:'page',targetId:p.value.pageId,principalKind:'member',principalId:reader.actor.id,level:'edit'});
 const base={expectedRevisionId:p.receipt.revisionId};
 await expect(publishPage(reader,p.value.pageId,{...base,operationKey:key('deny'),generalAccess:{kind:'workspace',level:'view'}})).rejects.toMatchObject({status:404});
 await expect(publishPage(owner,p.value.pageId,{...base,operationKey:key('cycle'),destination:{containerId,parentPageId:p.value.pageId,treePosition:'1'}})).rejects.toMatchObject({code:'TREE_CYCLE'});
 await expect(publishPage(owner,p.value.pageId,{...base,operationKey:key('attribution'),publishAsMemberId:'missing'})).rejects.toMatchObject({code:'INVALID_ATTRIBUTION'});
 await expect(publishPage(owner,p.value.pageId,{...base,operationKey:key('profile'),generalAccess:{kind:'container',level:'view'}})).rejects.toMatchObject({code:'GENERAL_ACCESS_PROFILE'});
 await setSharingConfiguration(owner,{operationKey:key('levels'),expectedRevisionId:null,levels:['full','edit','view']});
 await expect(publishPage(owner,p.value.pageId,{...base,operationKey:key('level'),generalAccess:{kind:'workspace',level:'comment'}})).rejects.toMatchObject({code:'LEVEL_UNAVAILABLE'});
 expect((await pageRow(owner,p.value.pageId)).revision_id).toBe(p.receipt.revisionId);
 expect(await rows("SELECT id FROM page_revisions WHERE page_id=? AND origin='publish'",p.value.pageId)).toEqual([]);
});

test('LIFE-003 real SQL failure and stale revision roll back location, grants, revision, receipt and activity',async()=>{
 const {owner,containerId}=await scenario();await profile(owner,{'page.lifecycle.v1':'draft-then-publish'});
 const p=await createPage(owner,{operationKey:key('rollback'),containerId,title:'Rollback'});
 const target=(await seedContainer(owner.actor.workspaceId,{ownerMemberId:owner.actor.id,visibility:'private'})).containerId;
 const before=await pageRow(owner,p.value.pageId),grants=await rows('SELECT * FROM page_grants WHERE page_id=?',p.value.pageId);
 const input={operationKey:key('sql-failure'),expectedRevisionId:p.receipt.revisionId,destination:{containerId:target,parentPageId:null,treePosition:'99'},generalAccess:{kind:'workspace' as const,level:'view' as const}};
 await env.DB.exec("CREATE TRIGGER qualification_publication_fail BEFORE INSERT ON content_events WHEN NEW.kind='published' BEGIN SELECT RAISE(ABORT,'qualification SQL failure'); END;");
 try {await expect(publishPage(owner,p.value.pageId,input)).rejects.toThrow('qualification SQL failure');}finally{await env.DB.exec('DROP TRIGGER qualification_publication_fail;');}
 expect(await pageRow(owner,p.value.pageId)).toEqual(before);
 expect(await rows('SELECT * FROM page_grants WHERE page_id=?',p.value.pageId)).toEqual(grants);
 expect(await rows('SELECT id FROM operation_receipts WHERE operation_key=?',input.operationKey)).toEqual([]);
 expect(await rows('SELECT id FROM activity_entries WHERE operation_key=?',input.operationKey)).toEqual([]);
 await expect(publishPage(owner,p.value.pageId,{...input,expectedRevisionId:'stale'})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 expect(await rows("SELECT id FROM page_revisions WHERE page_id=? AND origin='publish'",p.value.pageId)).toEqual([]);
});

test('LIFE-003 ACL epoch changes inside the real transaction fail closed before publication',async()=>{
 const {owner,containerId}=await scenario();await profile(owner,{'page.lifecycle.v1':'draft-then-publish'});
 const p=await createPage(owner,{operationKey:key('race-page'),containerId,title:'Epoch race'});
 const operationKey=key('epoch-race');
 await env.DB.exec(`CREATE TRIGGER qualification_acl_race AFTER INSERT ON operation_receipts WHEN NEW.operation_key='${operationKey}' BEGIN UPDATE core_acl_epoch SET epoch=epoch+1 WHERE id=1; END;`);
 try {await expect(publishPage(owner,p.value.pageId,{operationKey,expectedRevisionId:p.receipt.revisionId,generalAccess:{kind:'workspace',level:'view'}})).rejects.toMatchObject({code:'REVISION_CONFLICT'});}finally{await env.DB.exec('DROP TRIGGER qualification_acl_race;');}
 expect((await pageRow(owner,p.value.pageId)).lifecycle).toBe('draft');
 expect(await rows('SELECT id FROM operation_receipts WHERE operation_key=?',operationKey)).toEqual([]);
 expect((await requirePageLevel(owner,p.value.pageId,'full')).decision.level).toBe('full');
});

test('LIFE-003 legacy in-place caller needs page edit only and does not gain full authority',async()=>{
 const {owner,reader,containerId}=await scenario();await profile(owner,{'page.lifecycle.v1':'draft-then-publish'});
 const p=await createPage(owner,{operationKey:key('legacy-editor-page'),containerId,title:'Shared draft'});
 const grant=await saveGrant(owner,{operationKey:key('legacy-editor-grant'),targetKind:'page',targetId:p.value.pageId,principalKind:'member',principalId:reader.actor.id,level:'edit'});
 const before=await rows('SELECT * FROM page_grants WHERE id=?',grant.value.id);
 const published=await publishPage(reader,p.value.pageId,{operationKey:key('legacy-editor-publish'),expectedRevisionId:p.receipt.revisionId,label:'Legacy call',publishAsMemberId:owner.actor.id});
 expect((await readPage(reader,p.value.pageId)).page.revisionId).toBe(published.receipt.revisionId);
 expect((await requirePageLevel(reader,p.value.pageId,'edit')).decision.level).toBe('edit');
 expect(await rows('SELECT * FROM page_grants WHERE id=?',grant.value.id)).toEqual(before);
 await expect(requirePageLevel(reader,p.value.pageId,'full')).rejects.toMatchObject({status:404});
});
