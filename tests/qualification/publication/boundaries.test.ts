import {test,expect} from 'vitest';
import {env} from 'cloudflare:test';
import {scenario,profile,key,rows} from '../policies/helpers';
import {seedContainer,seedContainerGrant,seedWorkspace,seedMember} from '../../e2e/setup/fixtures';
import {createPage,readPage} from '../../../src/core/features/pages/service';
import {publishPage} from './review-helper';
import {saveGrant} from '../../../src/core/features/sharing/grants';
import {runContentJobs} from '../../../src/core/features/lifecycle/jobs';

test('LIFE-003 rejects inaccessible and foreign destinations and parents, descendant cycles and unowned children',async()=>{
 const {owner,reader,containerId}=await scenario();await profile(owner,{'page.lifecycle.v1':'draft-then-publish'});
 const p=await createPage(owner,{operationKey:key('root'),containerId,title:'Root'});
 const denied=(await seedContainer(owner.actor.workspaceId,{ownerMemberId:reader.actor.id,visibility:'private'})).containerId;
 const foreignWorkspace=(await seedWorkspace()).workspaceId,foreignOwner=(await seedMember(foreignWorkspace,{email:'foreign@test.invalid',displayName:'Foreign',role:'owner'})).memberId;
 const foreign=(await seedContainer(foreignWorkspace,{ownerMemberId:foreignOwner,visibility:'private'})).containerId;
 const target=(await seedContainer(owner.actor.workspaceId,{ownerMemberId:owner.actor.id,visibility:'private'})).containerId;
 const child=await createPage(owner,{operationKey:key('child'),containerId,parentPageId:p.value.pageId,title:'Child'});
 for(const destination of [{containerId:denied,parentPageId:null,treePosition:'1'},{containerId:foreign,parentPageId:null,treePosition:'1'}])await expect(publishPage(owner,p.value.pageId,{operationKey:key('deny-dest'),expectedRevisionId:p.receipt.revisionId,destination})).rejects.toMatchObject({status:404});
 await expect(publishPage(owner,p.value.pageId,{operationKey:key('wrong-parent'),expectedRevisionId:p.receipt.revisionId,destination:{containerId:target,parentPageId:child.value.pageId,treePosition:'1'}})).rejects.toMatchObject({code:'INVALID_PARENT'});
 await expect(publishPage(owner,p.value.pageId,{operationKey:key('desc-cycle'),expectedRevisionId:p.receipt.revisionId,destination:{containerId,parentPageId:child.value.pageId,treePosition:'1'}})).rejects.toMatchObject({code:'TREE_CYCLE'});
 await env.DB.prepare('UPDATE pages SET author_member_id=? WHERE id=?').bind(reader.actor.id,child.value.pageId).run();
 await expect(publishPage(owner,p.value.pageId,{operationKey:key('child-authority'),expectedRevisionId:p.receipt.revisionId,destination:{containerId:target,parentPageId:null,treePosition:'1'}})).rejects.toMatchObject({status:404});
 expect((await readPage(owner,p.value.pageId)).page.lifecycle).toBe('draft');
});

test('LIFE-003 personal and guest boundaries are enforced before publication',async()=>{
 const {owner,reader,guest,containerId}=await scenario();await profile(owner,{'page.lifecycle.v1':'draft-then-publish'});
 const personal=(await seedContainer(owner.actor.workspaceId,{ownerMemberId:owner.actor.id,visibility:'personal'})).containerId;
 const p=await createPage(owner,{operationKey:key('private'),containerId,title:'Private'});
 await expect(publishPage(owner,p.value.pageId,{operationKey:key('personal-wide'),expectedRevisionId:p.receipt.revisionId,destination:{containerId:personal,parentPageId:null,treePosition:'1'},generalAccess:{kind:'workspace',level:'view'}})).rejects.toMatchObject({code:'PERSONAL_PRIVATE'});
 await seedContainerGrant(containerId,{principalKind:'member',principalId:guest.actor.id,level:'edit'});
 await saveGrant(owner,{operationKey:key('guest-full'),targetKind:'page',targetId:p.value.pageId,principalKind:'member',principalId:guest.actor.id,level:'full'});
 await expect(publishPage(guest,p.value.pageId,{operationKey:key('guest-wide'),expectedRevisionId:p.receipt.revisionId,generalAccess:{kind:'workspace',level:'view'}})).rejects.toMatchObject({code:'GUEST_GENERAL_ACCESS'});
 await env.DB.prepare("UPDATE containers SET guest_access='forbidden' WHERE id=?").bind(containerId).run();
 await expect(publishPage(guest,p.value.pageId,{operationKey:key('guest-forbidden'),expectedRevisionId:p.receipt.revisionId})).rejects.toMatchObject({status:404});
 const done=await publishPage(owner,p.value.pageId,{operationKey:key('personal-restricted'),expectedRevisionId:p.receipt.revisionId,destination:{containerId:personal,parentPageId:null,treePosition:'1'},generalAccess:{kind:'restricted'}});
 expect(done.value.scheduled).toBe(false);await expect(readPage(reader,p.value.pageId)).rejects.toMatchObject({status:404});await expect(readPage(guest,p.value.pageId)).rejects.toMatchObject({status:404});
});

test('LIFE-003 competing revisions publish once; current revocation blocks replay',async()=>{
 const {owner,reader,containerId}=await scenario();await profile(owner,{'page.lifecycle.v1':'draft-then-publish'});
 await seedContainerGrant(containerId,{principalKind:'member',principalId:reader.actor.id,level:'edit'});
 const p=await createPage(owner,{operationKey:key('concurrent'),containerId,title:'Concurrent'});
 const grant=await saveGrant(owner,{operationKey:key('editor'),targetKind:'page',targetId:p.value.pageId,principalKind:'member',principalId:reader.actor.id,level:'full'});
 const input={operationKey:key('publish-reader'),expectedRevisionId:p.receipt.revisionId,generalAccess:{kind:'restricted' as const}};
 const results=await Promise.allSettled([publishPage({...reader},p.value.pageId,input),publishPage({...reader},p.value.pageId,{...input,operationKey:key('publish-race')})]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 expect(await rows("SELECT id FROM page_revisions WHERE page_id=? AND origin='publish'",p.value.pageId)).toHaveLength(1);
 const winner=results.find(r=>r.status==='fulfilled')!;expect(winner.status).toBe('fulfilled');
 await saveGrant(owner,{operationKey:key('revoke-editor'),targetKind:'page',targetId:p.value.pageId,id:grant.value.id,principalKind:'member',principalId:reader.actor.id,level:'full',revoke:true});
 await expect(publishPage(reader,p.value.pageId,input)).rejects.toMatchObject({status:404});
});

test('LIFE-004 firing rechecks attribution and selected policy and preserves private failed intent',async()=>{
 const {owner,reader,containerId}=await scenario();await profile(owner,{'page.lifecycle.v1':'draft-then-publish'});
 const p=await createPage(owner,{operationKey:key('policy'),containerId,title:'Policy change'}),due=new Date(Date.parse(owner.now)+60000).toISOString();
 await publishPage(owner,p.value.pageId,{operationKey:key('future-policy'),expectedRevisionId:p.receipt.revisionId,publishAt:due,publishAsMemberId:reader.actor.id,generalAccess:{kind:'workspace',level:'view'}});
 await profile(owner,{'page.access.v1':'container-general'});await runContentJobs(env,due);
 expect((await readPage(owner,p.value.pageId)).page.lifecycle).toBe('scheduled');
 expect((await rows('SELECT failure FROM content_schedules WHERE page_id=?',p.value.pageId))[0].failure).toContain('general principal');
 expect(await rows("SELECT id FROM page_grants WHERE page_id=? AND principal_kind IN ('workspace','container') AND revoked_at IS NULL",p.value.pageId)).toEqual([]);
 const q=await createPage(owner,{operationKey:key('attribution'),containerId,title:'Attribution change'});
 await publishPage(owner,q.value.pageId,{operationKey:key('future-attribution'),expectedRevisionId:q.receipt.revisionId,publishAt:due,publishAsMemberId:reader.actor.id});
 await env.DB.prepare("UPDATE members SET status='removed' WHERE id=?").bind(reader.actor.id).run();await runContentJobs(env,due);
 expect((await readPage(owner,q.value.pageId)).page.lifecycle).toBe('scheduled');
 expect((await rows('SELECT failure FROM content_schedules WHERE page_id=?',q.value.pageId))[0].failure).toBe('Choose an active member.');
});
