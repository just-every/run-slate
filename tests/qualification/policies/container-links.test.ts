import { test, expect } from 'vitest';
import { scenario, key, rows, textBlock, profile } from './helpers';
import { createContainer, readContainer, listContainers, updateContainer } from '../../../src/core/features/containers/service';
import { createPage, readPage, updatePage } from '../../../src/core/features/pages/service';
import { saveGrant } from '../../../src/core/features/sharing/grants';
import { bulkPages } from '../../../src/core/features/pages/bulk';
import { archivePage } from '../../../src/core/features/archive/service';
import { setStatusEntry } from '../../../src/core/features/page-status/service';
for (const access of ['class-led', 'grant-led'] as const)
    test(`CONT-001 CONT-002 CONT-003 CONT-004 CONT-006 CONT-008 CONT-009: ${access} actual container creation/settings/index authority and partial bulk failure`, async () => {
        const { owner, reader, guest, containerId } = await scenario();
        await profile(owner, { 'container.access.v1': access });
        const c = await createContainer(owner, { operationKey: key('container'), name: 'Research', description: 'Explicit purpose', icon: '🔬', key: 'SCI', visibility: 'private' });
        const original = await readContainer(owner, c.value.id);
        expect(original).toMatchObject({ name: 'Research', description: 'Explicit purpose', key: 'SCI', icon: '🔬', visibility: 'private', permissions: { canManage: true } });
        expect((await listContainers(reader)).items.map(c => c.id)).not.toContain(c.value.id);
        await expect(listContainers(guest)).rejects.toMatchObject({ status: 403 });
        await expect(updateContainer(reader, c.value.id, { operationKey: key('denied'), expectedRevisionId: c.receipt.revisionId, name: 'Intrusion' })).rejects.toMatchObject({ status: 403 });
        await saveGrant(owner, { operationKey: key('container-grant'), targetKind: 'container', targetId: c.value.id, principalKind: 'member', principalId: reader.actor.id, level: 'edit' });
        expect((await readContainer(reader, c.value.id)).permissions.canManage).toBe(false);
        expect((await listContainers(reader)).items.map(c => c.id)).toContain(c.value.id);
        const edited = await createPage(owner, { operationKey: key('editable'), containerId: c.value.id, title: 'Editable' });
        const secret = await createPage(owner, { operationKey: key('secret'), containerId, title: 'Cannot edit' });
        const result = await bulkPages(reader, { operationKey: key('bulk'), action: 'archive', pages: [{ id: edited.value.pageId, expectedRevisionId: edited.receipt.revisionId }, { id: secret.value.pageId, expectedRevisionId: secret.receipt.revisionId }] });
        expect(result.items.map(r => ({ id: r.id, success: r.success }))).toEqual([{ id: edited.value.pageId, success: true }, { id: secret.value.pageId, success: false }]);
        expect(result.items[1]).toMatchObject({ code: 'NOT_FOUND' });
        expect((await readPage(owner, edited.value.pageId)).page.lifecycle).toBe('archived');
        expect((await readPage(owner, secret.value.pageId)).page.lifecycle).toBe('live');
        expect(await rows("SELECT actor_member_id,action FROM activity_entries WHERE target_id=? AND action='archive.archive'", edited.value.pageId)).toEqual([{ actor_member_id: reader.actor.id, action: 'archive.archive' }]);
    });
test('LINK-003 LINK-004: page mention follows rename and exposes archived state without disclosing restricted title', async () => {
    const { owner, reader, containerId } = await scenario();
    const target = await createPage(owner, { operationKey: key('target'), containerId, title: 'Original title' });
    const source = await createPage(owner, { operationKey: key('source'), containerId, title: 'References', blocks: [{ ...textBlock(key('reference'), 'Old label'), content: { text: [{ text: 'Old label', mention: { kind: 'page', id: target.value.pageId, label: 'Old label' } }] } }] });
    await saveGrant(owner, { operationKey: key('source-grant'), targetKind: 'page', targetId: source.value.pageId, principalKind: 'member', principalId: reader.actor.id, level: 'view' });
    expect((await readPage(reader, source.value.pageId)).mentions[target.value.pageId]).toMatchObject({ label: 'Restricted page', available: false });
    const renamed = await updatePage(owner, target.value.pageId, { operationKey: key('rename'), expectedRevisionId: target.receipt.revisionId, properties: { title: 'Current title' } });
    expect((await readPage(owner, source.value.pageId)).mentions[target.value.pageId].label).toBe('Current title');
    await archivePage(owner, target.value.pageId, { operationKey: key('archive'), expectedRevisionId: renamed.receipt.revisionId, action: 'archive' });
    const mention = (await readPage(owner, source.value.pageId)).mentions[target.value.pageId];
    expect(mention).toMatchObject({ label: 'Current title', available: true, state: 'archived' });
});
test('CONT-006 STAT-002 PAGE-003 LINK-001: bulk owner/status/move/trash transitions preserve page identity and per-page receipts',async()=>{
 const {previewMove}=await import('../../../src/core/features/pages/tree');const {owner,reader,containerId}=await scenario();const destination=await createContainer(owner,{operationKey:key('destination'),name:'Bulk destination',visibility:'private'});await setStatusEntry(owner,{operationKey:key('status-entry'),key:'bulk-ready',label:'Bulk ready',color:'#112233',requiresVerification:false});const ids:string[]=[];for(const title of ['One','Two'])ids.push((await createPage(owner,{operationKey:key('page'),containerId,title})).value.pageId);
 const pages=async()=>Promise.all(ids.map(async id=>({id,expectedRevisionId:(await readPage(owner,id)).page.revisionId})));
 for(const action of ['owner','status']as const){const result=await bulkPages(owner,{operationKey:key(action),pages:await pages(),action,ownerMemberId:reader.actor.id,statusKey:'bulk-ready'});expect(result.items.every(r=>r.success)).toBe(true);for(const id of ids)expect((await readPage(owner,id)).properties).toMatchObject(action==='owner'?{ownerMemberId:reader.actor.id}:{statusKey:'bulk-ready'});}
 const accessPreviewHashes=Object.fromEntries(await Promise.all(ids.map(async id=>[id,(await previewMove(owner,id,{containerId:destination.value.id})).accessPreviewHash])));const moved=await bulkPages(owner,{operationKey:key('move'),pages:await pages(),action:'move',containerId:destination.value.id,accessPreviewHashes});expect(moved.items.every(r=>r.success)).toBe(true);for(const id of ids)expect((await readPage(owner,id)).page.containerId).toBe(destination.value.id);
 const trashed=await bulkPages(owner,{operationKey:key('trash'),pages:await pages(),action:'trash'});expect(trashed.items.every(r=>r.success)).toBe(true);for(const id of ids){const actions=(await rows('SELECT action FROM activity_entries WHERE target_id=?',id)).map(r=>r.action);expect(actions).toEqual(expect.arrayContaining(['pages.update','pages.status','pages.move','archive.trash']));await expect(readPage(owner,id)).rejects.toMatchObject({status:404});}
});
