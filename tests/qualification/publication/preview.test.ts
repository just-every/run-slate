import {env} from 'cloudflare:test';
import {test,expect} from 'vitest';
import {scenario,profile,key,rows} from '../policies/helpers';
import {seedContainer} from '../../e2e/setup/fixtures';
import {createPage,readPage,updatePage} from '../../../src/core/features/pages/service';
import {pageRow} from '../../../src/core/features/pages/repository';
import {saveGrant} from '../../../src/core/features/sharing/grants';
import {publishPage,publishScheduledPage} from '../../../src/core/features/lifecycle/publication';
import {previewPublication} from '../../../src/core/features/lifecycle/publication-preview';
import {runContentJobs} from '../../../src/core/features/lifecycle/jobs';
import type {PublicationSchedule} from '../../../src/core/features/lifecycle/publication-input';

async function privateDestination(){
 const s=await scenario();await profile(s.owner,{'page.lifecycle.v1':'draft-then-publish'});
 const target=(await seedContainer(s.owner.actor.workspaceId,{ownerMemberId:s.owner.actor.id,visibility:'private'})).containerId;
 const p=await createPage(s.owner,{operationKey:key('preview-page'),containerId:s.containerId,title:'Reviewed private destination'});
 const input={operationKey:key('confirm-preview'),expectedRevisionId:p.receipt.revisionId,destination:{containerId:target,parentPageId:null,treePosition:'2'}};
 return {...s,target,p,input};
}

test('LIFE-003 reviewed private destination rejects newly authorized reader while page CAS remains unchanged; re-review commits and replays',async()=>{
 const {owner,reader,target,p,input}=await privateDestination();
 const preview=await previewPublication(owner,p.value.pageId,input);
 expect(preview.audience[0]!.readers.some(r=>r.memberId===reader.actor.id&&r.after)).toBe(false);
 await expect(publishPage(owner,p.value.pageId,input)).rejects.toMatchObject({status:409,code:'PUBLICATION_PREVIEW_CHANGED'});
 await saveGrant(owner,{operationKey:key('new-destination-reader'),targetKind:'container',targetId:target,principalKind:'member',principalId:reader.actor.id,level:'view'});
 expect((await pageRow(owner,p.value.pageId)).revision_id).toBe(input.expectedRevisionId);
 await expect(publishPage(owner,p.value.pageId,{...input,previewFingerprint:preview.previewFingerprint})).rejects.toMatchObject({code:'PUBLICATION_PREVIEW_CHANGED'});
 expect(await rows('SELECT id FROM operation_receipts WHERE operation_key=?',input.operationKey)).toEqual([]);
 expect(await rows("SELECT id FROM page_revisions WHERE page_id=? AND origin='publish'",p.value.pageId)).toEqual([]);
 await expect(readPage(reader,p.value.pageId)).rejects.toMatchObject({status:404});
 const current=await previewPublication(owner,p.value.pageId,input);
 expect(current.audience[0]!.readers.find(r=>r.memberId===reader.actor.id)).toMatchObject({after:'view'});
 const confirmed={...input,previewFingerprint:current.previewFingerprint};const result=await publishPage(owner,p.value.pageId,confirmed);
 expect(await publishPage(owner,p.value.pageId,confirmed)).toEqual(result);
 expect((await readPage(reader,p.value.pageId)).page.lifecycle).toBe('live');
});

test('TREE-002 position-only publication with edit access requires no full authority and changes no audience',async()=>{
 const {owner,reader,containerId}=await scenario();await profile(owner,{'page.lifecycle.v1':'draft-then-publish'});
 const p=await createPage(owner,{operationKey:key('position-page'),containerId,title:'Editor position'});
 await saveGrant(owner,{operationKey:key('position-container-editor'),targetKind:'container',targetId:containerId,principalKind:'member',principalId:reader.actor.id,level:'edit'});
 await saveGrant(owner,{operationKey:key('position-page-editor'),targetKind:'page',targetId:p.value.pageId,principalKind:'member',principalId:reader.actor.id,level:'edit'});
 const input={operationKey:key('position-publish'),expectedRevisionId:p.receipt.revisionId,destination:{containerId,parentPageId:null,treePosition:'99'}};
 const review=await previewPublication(reader,p.value.pageId,input);
 await publishPage(reader,p.value.pageId,{...input,previewFingerprint:review.previewFingerprint});
 expect(await pageRow(owner,p.value.pageId)).toMatchObject({tree_position:'99',lifecycle:'live'});
 expect((await readPage(reader,p.value.pageId)).permissions).toMatchObject({level:'edit',canShare:false});
});

test('LIFE-003 preview binds exact options, content and descendants and rejects a subtree race atomically',async()=>{
 const {owner,p,input,containerId}=await privateDestination();
 const review=await previewPublication(owner,p.value.pageId,input);
 await expect(publishPage(owner,p.value.pageId,{...input,label:'Unreviewed label',previewFingerprint:review.previewFingerprint})).rejects.toMatchObject({code:'PUBLICATION_PREVIEW_CHANGED'});
 await createPage(owner,{operationKey:key('new-descendant'),containerId,parentPageId:p.value.pageId,title:'New child'});
 await expect(publishPage(owner,p.value.pageId,{...input,previewFingerprint:review.previewFingerprint})).rejects.toMatchObject({code:'PUBLICATION_PREVIEW_CHANGED'});
 const fresh=await previewPublication(owner,p.value.pageId,input);
 expect(fresh.descendants).toHaveLength(1);expect(fresh.content.properties.title).toBe('Reviewed private destination');
 const child=fresh.descendants[0]!;
 await env.DB.exec(`CREATE TRIGGER qualification_preview_child_race AFTER INSERT ON operation_receipts WHEN NEW.operation_key='${input.operationKey}' BEGIN UPDATE pages SET revision_id='raced-child' WHERE id='${child.pageId}'; END;`);
 try{await expect(publishPage(owner,p.value.pageId,{...input,previewFingerprint:fresh.previewFingerprint})).rejects.toMatchObject({code:'REVISION_CONFLICT'});}finally{await env.DB.exec('DROP TRIGGER qualification_preview_child_race;');}
 expect((await pageRow(owner,child.pageId)).revision_id).toBe(child.revisionId);
 expect((await pageRow(owner,p.value.pageId)).lifecycle).toBe('draft');
 expect(await rows('SELECT id FROM operation_receipts WHERE operation_key=?',input.operationKey)).toEqual([]);
});

test('LIFE-004 saved reviewed audience survives context restart and fails scheduled release when an authorized destination grant widens it',async()=>{
 const {owner,reader,p,input,target}=await privateDestination();
 const due=new Date(Date.parse(owner.now)+60000).toISOString();const options={...input,publishAt:due};
 const review=await previewPublication(owner,p.value.pageId,options);
 await publishPage(owner,p.value.pageId,{...options,previewFingerprint:review.previewFingerprint});
 const saved=(await env.DB.prepare('SELECT * FROM content_schedules WHERE page_id=?').bind(p.value.pageId).first<PublicationSchedule>())!;
 expect(JSON.parse(saved.publication_json!).review.options.publishAt).toBe(due);
 await saveGrant(owner,{operationKey:key('schedule-new-reader'),targetKind:'container',targetId:target,principalKind:'member',principalId:reader.actor.id,level:'view'});
 await expect(publishScheduledPage({...owner,authorizationEpoch:undefined,now:due},JSON.parse(JSON.stringify(saved)))).rejects.toMatchObject({code:'PUBLICATION_PREVIEW_CHANGED'});
 await runContentJobs(env,due);
 expect((await pageRow(owner,p.value.pageId)).lifecycle).toBe('scheduled');
 expect(await rows("SELECT id FROM page_revisions WHERE page_id=? AND origin='publish'",p.value.pageId)).toEqual([]);
 expect((await rows('SELECT state,failure FROM content_schedules WHERE page_id=?',p.value.pageId))[0]).toMatchObject({state:'failed'});
 await expect(readPage(reader,p.value.pageId)).rejects.toMatchObject({status:404});
});


test('LIFE-003 a content edit invalidates review even when confirmation adopts the new CAS',async()=>{
 const {owner,p,input}=await privateDestination();
 const review=await previewPublication(owner,p.value.pageId,input);
 const changed=await updatePage(owner,p.value.pageId,{operationKey:key('edit-reviewed-title'),expectedRevisionId:input.expectedRevisionId,properties:{title:'Changed after review'}});
 await expect(publishPage(owner,p.value.pageId,{...input,expectedRevisionId:changed.receipt.revisionId,previewFingerprint:review.previewFingerprint})).rejects.toMatchObject({code:'PUBLICATION_PREVIEW_CHANGED'});
 expect((await pageRow(owner,p.value.pageId)).lifecycle).toBe('draft');
 expect(await rows('SELECT id FROM operation_receipts WHERE operation_key=?',input.operationKey)).toEqual([]);
});

test('LIFE-004 a full-access nonauthor schedules the exact reviewed restricted release and fires without another confirmation',async()=>{
 const {owner,reader,containerId}=await scenario();
 const p=await createPage(owner,{operationKey:key('live-nonauthor'),containerId,title:'Scheduled by editor with full access'});
 await saveGrant(owner,{operationKey:key('full-nonauthor'),targetKind:'page',targetId:p.value.pageId,principalKind:'member',principalId:reader.actor.id,level:'full'});
 const due=new Date(Date.parse(reader.now)+60000).toISOString();
 const input={operationKey:key('stage-nonauthor'),expectedRevisionId:p.receipt.revisionId,publishAt:due,generalAccess:{kind:'restricted' as const}};
 const preview=await previewPublication(reader,p.value.pageId,input);
 await publishPage(reader,p.value.pageId,{...input,previewFingerprint:preview.previewFingerprint});
 await runContentJobs(env,due);
 expect((await pageRow(owner,p.value.pageId)).lifecycle).toBe('live');
 expect(await rows('SELECT state FROM content_schedules WHERE page_id=?',p.value.pageId)).toEqual([{state:'published'}]);
});
