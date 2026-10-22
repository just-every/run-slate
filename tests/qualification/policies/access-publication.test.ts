import { env, SELF } from 'cloudflare:test';
import { test, expect, beforeEach } from 'vitest';
import {resetDeployment} from '../../e2e/setup/reset-deployment';

// Every policy case owns one installation, including variants inside a matrix.
beforeEach(resetDeployment);
import { scenario, profile, key, rows } from './helpers';
import { seedGroup, seedContainer, seedContainerGrant, sessionFor } from '../../e2e/setup/fixtures';
import { createPage, readPage, updatePage } from '../../../src/core/features/pages/service';
import { saveGrant } from '../../../src/core/features/sharing/grants';
import { createComment } from '../../../src/core/features/comments/service';
import { publishPublicPage } from '../../../src/core/features/publishing/service';
import { setContainerAccess } from '../../../src/core/features/sharing/container-settings';
test("LIFE-002 SHARE-001 SHARE-002 SHARE-004 SHARE-005 SHARE-007 SHARE-008 CONT-005: neither access profile widens private drafts, personal or expired grants", async () => {
    for (const access of ['workspace-general', 'container-general'] as const) {
        await resetDeployment();
        const { owner, reader, outsider, containerId } = await scenario();
        await profile(owner, { 'page.access.v1': access });
        const p = await createPage(owner, { operationKey: key('draft'), containerId, title: 'Private draft', lifecycle: 'draft' }), id = p.value.pageId;
        for (const actor of [reader, outsider])
            await expect(readPage(actor, id)).rejects.toMatchObject({ status: 404 });
        for (const principalKind of ['workspace', 'container'] as const)
            await expect(saveGrant(owner, { operationKey: key('general'), targetKind: 'page', targetId: id, principalKind, principalId: principalKind === 'workspace' ? owner.actor.workspaceId : containerId, level: 'view' })).rejects.toMatchObject({ code: 'DRAFT_PRIVATE' });
        for (const level of ['view', 'comment', 'edit', 'full'] as const) {
            const grant = await saveGrant(owner, { operationKey: key('level'), targetKind: 'page', targetId: id, principalKind: 'member', principalId: reader.actor.id, level });
            expect((await readPage(reader, id)).permissions.level).toBe(level);
            const comment = () => createComment(reader, id, { operationKey: key('comment'), body: [{ text: 'Access test' }] });
            if (level === 'view')
                await expect(comment()).rejects.toMatchObject({ status: 404 });
            else
                expect((await comment()).value.id).toBeTruthy();
            const edit = () => updatePage(reader, id, { operationKey: key('edit'), expectedRevisionId: p.receipt.revisionId, properties: { title: 'Private draft' } });
            if (['view', 'comment'].includes(level))
                await expect(edit()).rejects.toMatchObject({ status: 404 });
            else
                expect((await edit()).value.pageId).toBe(id);
            await saveGrant(owner, { operationKey: key('revoke'), targetKind: 'page', targetId: id, id: grant.value.id, principalKind: 'member', principalId: reader.actor.id, level, revoke: true });
            await expect(readPage(reader, id)).rejects.toMatchObject({ status: 404 });
        }
        const g = await saveGrant(owner, { operationKey: key('expiry'), targetKind: 'page', targetId: id, principalKind: 'member', principalId: reader.actor.id, level: 'view', expiresAt: new Date(Date.parse(owner.now) + 1000).toISOString() });
        expect((await readPage(reader, id)).page.id).toBe(id);
        await expect(readPage({ ...reader, now: new Date(Date.parse(owner.now) + 1001).toISOString() }, id)).rejects.toMatchObject({ status: 404 });
        expect(await rows('SELECT id,revoked_at FROM page_grants WHERE id=?', g.value.id)).toEqual([{ id: g.value.id, revoked_at: null }]);
        const personal = await seedContainer(owner.actor.workspaceId, { ownerMemberId: owner.actor.id, visibility: 'personal' });
        await seedContainerGrant(personal.containerId, { principalKind: 'member', principalId: owner.actor.id, level: 'full' });
        const pp = await createPage(owner, { operationKey: key('personal'), containerId: personal.containerId, title: 'Personal' });
        await expect(saveGrant(owner, { operationKey: key('personal-share'), targetKind: 'page', targetId: pp.value.pageId, principalKind: 'member', principalId: reader.actor.id, level: 'view' })).rejects.toMatchObject({ code: 'PERSONAL_PRIVATE' });
        await expect(readPage(outsider, pp.value.pageId)).rejects.toMatchObject({ status: 404 });
    }
});
test('SHARE-003 SHARE-005 SHARE-007 CONT-009: inherited group membership is live and switching general profile rewrites no grant', async () => {
    const { owner, reader, containerId } = await scenario();
    const { groupId } = await seedGroup(owner.actor.workspaceId, { name: 'Reviewers', memberIds: [reader.actor.id] });
    const root = await createPage(owner, { operationKey: key('root'), containerId, title: 'Parent' });
    await saveGrant(owner, { operationKey: key('group'), targetKind: 'page', targetId: root.value.pageId, principalKind: 'group', principalId: groupId, level: 'view' });
    const child = await createPage(owner, { operationKey: key('child'), containerId, parentPageId: root.value.pageId, title: 'Inherited' });
    expect((await readPage(reader, child.value.pageId)).permissions.level).toBe('view');
    const before = await rows('SELECT * FROM page_grants WHERE page_id=? ORDER BY id', root.value.pageId);
    for (const value of ['container-general', 'workspace-general'] as const) {
        await profile(owner, { 'page.access.v1': value });
        expect(await rows('SELECT * FROM page_grants WHERE page_id=? ORDER BY id', root.value.pageId)).toEqual(before);
    }
    await env.DB.prepare('DELETE FROM group_members WHERE group_id=? AND member_id=?').bind(groupId, reader.actor.id).run();
    await expect(readPage(reader, root.value.pageId)).rejects.toMatchObject({ status: 404 });
    await expect(readPage(reader, child.value.pageId)).rejects.toMatchObject({ status: 404 });
});
test("WEB-001 WEB-002 WEB-003 WEB-004 WEB-005 WEB-006 WEB-007 CONT-007 CONT-008: HTTP publication, independent vetoes and stored superset across both public-access profiles", async () => {
    for (const publicProfile of ['site', 'link'] as const) {
        await resetDeployment();
        const { owner, guest, containerId } = await scenario();
        await profile(owner, { 'page.public-access.v1': publicProfile });
        const page = await createPage(owner, { operationKey: key('public'), containerId, title: 'Public safe title' }), id = page.value.pageId;
        const child = await createPage(owner, { operationKey: key('child'), containerId, parentPageId: id, title: 'Private child' });
        const input = { operationKey: key('exposure'), expectedRevisionId: page.receipt.revisionId, host: 'localhost', slug: `qualification-${id}`, theme: 'dark', headerControls: [], duplicateAsTemplate: true, socialPreview: { title: 'Social title' } };
        await publishPublicPage(owner, id, input);
        let response = await SELF.fetch(`http://localhost/p/${input.slug}`);
        expect(response.status).toBe(200);
        expect(response.headers.get('set-cookie')).toBeNull();
        expect(response.headers.get('x-robots-tag')).toBe('noindex,nofollow');
        expect(await response.text()).toContain('Public safe title');
        expect(await rows('SELECT * FROM public_exposures WHERE page_id=?', child.value.pageId)).toEqual([]);
        const before = await rows('SELECT * FROM public_exposures WHERE page_id=?', id);
        await profile(owner, { 'page.public-access.v1': publicProfile === 'site' ? 'link' : 'site', 'container.access.v1': 'grant-led' });
        expect(await rows('SELECT * FROM public_exposures WHERE page_id=?', id)).toEqual(before);
        await profile(owner, { 'page.public-access.v1': publicProfile, 'container.access.v1': 'class-led' });
        expect(await rows('SELECT * FROM public_exposures WHERE page_id=?', id)).toEqual(before);
        const switches = async (guestAccess: 'allowed' | 'forbidden', publicLinkAccess: 'allowed' | 'forbidden', anonymousAccess: 'allowed' | 'forbidden') => { const [c] = await rows('SELECT revision_id FROM containers WHERE id=?', containerId); return setContainerAccess(owner, { operationKey: key('switch'), id: containerId, expectedRevisionId: c.revision_id as string, visibility: 'private', guestAccess, publicLinkAccess, anonymousAccess }); };
        await saveGrant(owner, { operationKey: key('guest'), targetKind: 'page', targetId: id, principalKind: 'member', principalId: guest.actor.id, level: 'view' });
        await switches('forbidden', 'allowed', 'allowed');
        await expect(readPage(guest, id)).rejects.toMatchObject({ status: 404 });
        expect((await SELF.fetch(`http://localhost/p/${input.slug}`)).status).toBe(200);
        await switches('allowed', 'allowed', 'forbidden');
        expect((await readPage(guest, id)).page.id).toBe(id);
        expect((await SELF.fetch(`http://localhost/p/${input.slug}`)).status).toBe(404);
        const guestCookie = await sessionFor(guest.actor.id);
        expect((await SELF.fetch(`http://localhost/p/${input.slug}`, { headers: { Cookie: guestCookie } })).status).toBe(200);
        await switches('allowed', 'forbidden', 'allowed');
        expect((await SELF.fetch(`http://localhost/p/${input.slug}`)).status).toBe(404);
        await expect(publishPublicPage(owner, id, { ...input, operationKey: key('veto') })).rejects.toMatchObject({ code: 'PUBLICATION_FORBIDDEN' });
        await switches('allowed', 'allowed', 'allowed');
        await publishPublicPage(owner, id, { ...input, operationKey: key('index'), indexable: true });
        expect((await SELF.fetch(`http://localhost/p/${input.slug}`)).headers.get('x-robots-tag')).toBe('index,follow');
        await publishPublicPage(owner, id, { ...input, operationKey: key('unpublish'), revoke: true });
        expect((await SELF.fetch(`http://localhost/p/${input.slug}`)).status).toBe(404);
        const second = await createPage(owner, { operationKey: key('collision'), containerId, title: 'Second' });
        await expect(publishPublicPage(owner, second.value.pageId, { ...input, operationKey: key('collision'), expectedRevisionId: second.receipt.revisionId })).rejects.toMatchObject({ code: 'SLUG_RESERVED' });
        await publishPublicPage(owner, id, { ...input, operationKey: key('republish') });
        expect((await SELF.fetch(`http://localhost/p/${input.slug}`)).status).toBe(200);
    }
});
test("SHARE-001 SHARE-004 SHARE-005: live workspace and container general principals are never broadened by either access profile", async () => {
    for (const principalKind of ['workspace', 'container'] as const) {
        await resetDeployment();
        const { owner, reader, outsider, containerId } = await scenario();
        const p = await createPage(owner, { operationKey: key('page'), containerId, title: 'General principal' });
        await owner.db.prepare('INSERT INTO container_members(container_id,member_id,created_at) VALUES(?,?,?)').bind(containerId, reader.actor.id, owner.now).run();
        const grant = await saveGrant(owner, { operationKey: key('general'), targetKind: 'page', targetId: p.value.pageId, principalKind, principalId: principalKind === 'container' ? containerId : owner.actor.workspaceId, level: 'view' });
        const stored = await rows('SELECT * FROM page_grants WHERE page_id=?', p.value.pageId);
        for (const profileValue of ['container-general', 'workspace-general'] as const) {
            await profile(owner, { 'page.access.v1': profileValue });
            expect((await readPage(reader, p.value.pageId)).page.id).toBe(p.value.pageId);
            if (principalKind === 'container')
                await expect(readPage(outsider, p.value.pageId)).rejects.toMatchObject({ status: 404 });
            else
                expect((await readPage(outsider, p.value.pageId)).page.id).toBe(p.value.pageId);
            expect(await rows('SELECT * FROM page_grants WHERE page_id=?', p.value.pageId)).toEqual(stored);
        }
        await saveGrant(owner, { operationKey: key('replace-general'), targetKind: 'page', targetId: p.value.pageId, principalKind: principalKind === 'workspace' ? 'container' : 'workspace', principalId: principalKind === 'workspace' ? containerId : owner.actor.workspaceId, level: 'view' });
        expect(await rows("SELECT id FROM page_grants WHERE page_id=? AND principal_kind IN ('workspace','container')", p.value.pageId)).toHaveLength(1);
    }
});
