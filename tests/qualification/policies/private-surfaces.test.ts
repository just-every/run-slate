import { test, expect, beforeEach } from 'vitest';
import {resetDeployment} from '../../e2e/setup/reset-deployment';

// Every policy case owns one installation, including variants inside a matrix.
beforeEach(resetDeployment);
import { scenario, key, profile } from './helpers';
import { createPage, readPage } from '../../../src/core/features/pages/service';
import { listPages } from '../../../src/core/features/pages/tree';
import { contentQuery } from '../../../src/core/features/pages/queries';
import { search } from '../../../src/core/features/search/service';
import { notificationList } from '../../../src/core/features/notifications/service';
import { resolveEvidence } from '../../../src/core/features/ai/evidence';
import { saveGrant, listGrants } from '../../../src/core/features/sharing/grants';
import { sharingConfiguration, setSharingConfiguration } from '../../../src/core/features/sharing/configuration';
import { createComment } from '../../../src/core/features/comments/service';
test("LIFE-002 SHARE-007: explicitly retained private draft cannot enter other actor search/tree/query/inbox/AI under either lifecycle profile", async () => {
    for (const lifecycle of ['always-live', 'draft-then-publish'] as const) {
        await resetDeployment();
        const { owner, reader, outsider, containerId } = await scenario();
        await profile(owner, { 'page.lifecycle.v1': lifecycle });
        const p = await createPage(owner, { operationKey: key('draft'), containerId, title: 'Unshared quasar secret', lifecycle: 'draft' });
        const common = await createPage(owner, { operationKey: key('common'), containerId, title: 'Query host', lifecycle: 'live' });
        await saveGrant(owner, { operationKey: key('common-grant'), targetKind: 'page', targetId: common.value.pageId, principalKind: 'member', principalId: reader.actor.id, level: 'view' });
        for (const actor of [reader, outsider]) {
            expect((await search(actor, { query: 'quasar' })).items).toEqual([]);
            expect((await listPages(actor)).items.map(p => p.id)).not.toContain(p.value.pageId);
            expect((await notificationList(actor)).items.map(n => n.pageId)).not.toContain(p.value.pageId);
            await expect(resolveEvidence(actor, [{ kind: 'page', sourceId: p.value.pageId, revisionId: p.receipt.revisionId }], [])).rejects.toMatchObject({ status: 404 });
        }
        expect((await contentQuery(reader, common.value.pageId, {})).items.map(p => p.id)).not.toContain(p.value.pageId);
        const grant = await saveGrant(owner, { operationKey: key('share-draft'), targetKind: 'page', targetId: p.value.pageId, principalKind: 'member', principalId: reader.actor.id, level: 'view' });
        expect((await readPage(reader, p.value.pageId)).page.title).toBe('Unshared quasar secret');
        await saveGrant(owner, { operationKey: key('revoke'), targetKind: 'page', targetId: p.value.pageId, id: grant.value.id, principalKind: 'member', principalId: reader.actor.id, level: 'view', revoke: true });
        expect((await listPages(reader)).items.map(p => p.id)).not.toContain(p.value.pageId);
        expect((await notificationList(reader)).items.map(n => n.pageId)).not.toContain(p.value.pageId);
    }
});
test('LIFE-002: a draft is excluded from AI grounding even for its author', async () => { const { owner, containerId } = await scenario(); const p = await createPage(owner, { operationKey: key('draft'), containerId, title: 'Author draft', lifecycle: 'draft' }); await expect(resolveEvidence(owner, [{ kind: 'page', sourceId: p.value.pageId, revisionId: p.receipt.revisionId }], [])).rejects.toMatchObject({ status: 404 }); });
test('SHARE-001 SHARE-003 SHARE-005 SHARE-008: inherited provenance, retained expired rows and configured levels are independent of profile', async () => {
    const { owner, reader, containerId } = await scenario();
    const parent = await createPage(owner, { operationKey: key('parent'), containerId, title: 'Parent access' });
    const grant = await saveGrant(owner, { operationKey: key('parent-grant'), targetKind: 'page', targetId: parent.value.pageId, principalKind: 'member', principalId: reader.actor.id, level: 'comment', expiresAt: new Date(Date.parse(owner.now) + 1000).toISOString() });
    const child = await createPage(owner, { operationKey: key('child'), containerId, parentPageId: parent.value.pageId, title: 'Child access' });
    const listing = await listGrants(owner, 'page', child.value.pageId);
    expect(listing.inheritedItems.find(g => g.id === grant.value.id)).toMatchObject({ inherited: true, effective: true, status: 'active', origin: { kind: 'page', id: parent.value.pageId, name: 'Parent access' } });
    expect((await listGrants({ ...owner, now: new Date(Date.parse(owner.now) + 2000).toISOString() }, 'page', child.value.pageId)).inheritedItems.find(g => g.id === grant.value.id)).toMatchObject({ status: 'expired', effective: false });
    const current = await sharingConfiguration(owner);
    const config = await setSharingConfiguration(owner, { operationKey: key('levels'), expectedRevisionId: current.revisionId, levels: ['full', 'edit', 'view'] });
    for (const access of ['container-general', 'workspace-general'] as const) {
        await profile(owner, { 'page.access.v1': access });
        expect((await listGrants(owner, 'page', child.value.pageId)).levels).toEqual(['full', 'edit', 'view']);
        await expect(saveGrant(owner, { operationKey: key('removed-level'), targetKind: 'page', targetId: child.value.pageId, principalKind: 'member', principalId: reader.actor.id, level: 'comment' })).rejects.toMatchObject({ code: 'LEVEL_UNAVAILABLE' });
        expect((await readPage(reader, child.value.pageId)).permissions.level).toBe('comment');
    }
    await setSharingConfiguration(owner, { operationKey: key('restore-levels'), expectedRevisionId: config.receipt.revisionId, levels: ['full', 'edit', 'comment', 'view'] });
    expect((await sharingConfiguration(owner)).levels).toContain('comment');
});
test('SHARE-005 SAVE-003 SAVE-005: concurrent first configuration writes have one winner, then stale updates reject and exact operation replay is stable', async () => {
    const { owner } = await scenario();
    const writes = [{ operationKey: key('config-a'), expectedRevisionId: null, levels: ['full', 'view'] as const }, { operationKey: key('config-b'), expectedRevisionId: null, levels: ['full', 'edit', 'view'] as const }];
    const results = await Promise.allSettled(writes.map(input => setSharingConfiguration({ ...owner }, { ...input, levels: [...input.levels] })));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    const winner = results.findIndex(r => r.status === 'fulfilled');
    expect(await setSharingConfiguration(owner, { ...writes[winner], levels: [...writes[winner].levels] })).toEqual((results[winner] as PromiseFulfilledResult<unknown>).value);
    await expect(setSharingConfiguration(owner, { operationKey: key('stale'), expectedRevisionId: null, levels: ['view'] })).rejects.toMatchObject({ status: 409 });
    expect((await sharingConfiguration(owner)).levels).toEqual([...writes[winner].levels]);
});
test('SHARE-003 SHARE-007 REV-001: HTTP restrict/unrestrict cascades current inheritance without copying parent grants', async () => {
    const { SELF } = await import('cloudflare:test');
    const { sessionFor } = await import('../../e2e/setup/fixtures');
    const { rows } = await import('./helpers');
    const { owner, reader, containerId } = await scenario();
    const parent = await createPage(owner, { operationKey: key('parent'), containerId, title: 'Parent' });
    await saveGrant(owner, { operationKey: key('parent-read'), targetKind: 'page', targetId: parent.value.pageId, principalKind: 'member', principalId: reader.actor.id, level: 'view' });
    const child = await createPage(owner, { operationKey: key('child'), containerId, parentPageId: parent.value.pageId, title: 'Restricted branch' });
    await saveGrant(owner, { operationKey: key('direct-owner'), targetKind: 'page', targetId: child.value.pageId, principalKind: 'member', principalId: owner.actor.id, level: 'full' });
    const grandchild = await createPage(owner, { operationKey: key('grandchild'), containerId, parentPageId: child.value.pageId, title: 'Descendant' });
    const direct = await rows('SELECT * FROM page_grants WHERE page_id=? ORDER BY id', child.value.pageId);
    expect((await readPage(reader, grandchild.value.pageId)).page.id).toBe(grandchild.value.pageId);
    const cookie = await sessionFor(owner.actor.id);
    const set = async (restricted: boolean, expectedRevisionId: string) => { const response = await SELF.fetch(`http://localhost/api/sharing/pages/${child.value.pageId}/inheritance`, { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'http://localhost' }, body: JSON.stringify({ operationKey: key('inheritance'), expectedRevisionId, restricted }) }); expect(response.status).toBe(200); return await response.json() as {
        value: {
            revisionId: string;
        };
    }; };
    const restricted = await set(true, child.receipt.revisionId);
    await expect(readPage(reader, child.value.pageId)).rejects.toMatchObject({ status: 404 });
    await expect(readPage(reader, grandchild.value.pageId)).rejects.toMatchObject({ status: 404 });
    expect((await listGrants(owner, 'page', child.value.pageId)).restricted).toBe(true);
    expect(await rows('SELECT * FROM page_grants WHERE page_id=? ORDER BY id', child.value.pageId)).toEqual(direct);
    const restored = await set(false, restricted.value.revisionId);
    expect(restored.value.revisionId).not.toBe(restricted.value.revisionId);
    expect((await readPage(reader, grandchild.value.pageId)).page.id).toBe(grandchild.value.pageId);
    expect(await rows('SELECT * FROM page_grants WHERE page_id=? ORDER BY id', child.value.pageId)).toEqual(direct);
});
