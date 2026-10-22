import { env } from 'cloudflare:test';
import { test, expect, beforeEach } from 'vitest';
import {resetDeployment} from '../../e2e/setup/reset-deployment';

// Every policy case owns one installation, including variants inside a matrix.
beforeEach(resetDeployment);
import { scenario, profile, key, rows } from './helpers';
import { createPage, readPage, updatePage } from '../../../src/core/features/pages/service';
import { publishPage, cancelSchedule, discardChanges } from '../../../src/core/features/lifecycle/service';
import { runContentJobs } from '../../../src/core/features/lifecycle/jobs';
import { saveGrant } from '../../../src/core/features/sharing/grants';
import { revisionHistory, readRevision, restorePageRevision, deleteRevision } from '../../../src/core/features/versions/service';
test("LIFE-001 LIFE-003 LIFE-005 LIFE-006 REV-001 REV-002 REV-007: labelled snapshots and reader visibility across both lifecycle profiles", async () => {
    for (const lifecycle of ['always-live', 'draft-then-publish'] as const) {
        await resetDeployment();
        const { owner, reader, containerId } = await scenario();
        await profile(owner, { 'page.lifecycle.v1': lifecycle, 'page.version.v1': 'labelled' });
        const created = await createPage(owner, { operationKey: key('create'), containerId, title: 'Prior title' }), id = created.value.pageId;
        expect((await readPage(owner, id)).page.lifecycle).toBe(lifecycle === 'always-live' ? 'live' : 'draft');
        expect((await revisionHistory(owner, id)).every(r => r.ordinal === null)).toBe(true);
        await saveGrant(owner, { operationKey: key('share'), targetKind: 'page', targetId: id, principalKind: 'member', principalId: reader.actor.id, level: 'view' });
        const published = await publishPage(owner, id, { operationKey: key('publish'), expectedRevisionId: created.receipt.revisionId, label: 'First decision' });
        const immutable = await readRevision(owner, id, published.receipt.revisionId);
        const updated = await updatePage(owner, id, { operationKey: key('edit'), expectedRevisionId: published.receipt.revisionId, properties: { title: 'New title' } });
        expect((await readPage(reader, id)).page.title).toBe(lifecycle === 'always-live' ? 'New title' : 'Prior title');
        expect((await readRevision(owner, id, published.receipt.revisionId)).properties).toEqual(immutable.properties);
        expect((await readRevision(owner, id, published.receipt.revisionId)).newerRevisionExists).toBe(true);
        const before = await rows('SELECT * FROM page_revisions WHERE page_id=? ORDER BY id', id);
        await profile(owner, { 'page.lifecycle.v1': lifecycle === 'always-live' ? 'draft-then-publish' : 'always-live', 'page.version.v1': 'autosnapshot' });
        expect(await rows('SELECT * FROM page_revisions WHERE page_id=? ORDER BY id', id)).toEqual(before);
        await profile(owner, { 'page.lifecycle.v1': lifecycle, 'page.version.v1': 'labelled' });
        expect(await rows('SELECT * FROM page_revisions WHERE page_id=? ORDER BY id', id)).toEqual(before);
        expect((await revisionHistory(owner, id)).find(r => r.id === published.receipt.revisionId)).toMatchObject({ ordinal: 1, label: 'First decision', origin: 'publish', authorMemberId: owner.actor.id });
        if (lifecycle === 'draft-then-publish') {
            await discardChanges(owner, id, { operationKey: key('discard'), expectedRevisionId: updated.receipt.revisionId });
            expect((await readPage(owner, id)).page.title).toBe('Prior title');
            expect((await revisionHistory(owner, id)).length).toBe(before.length + 1);
        }
    }
});
test('LIFE-004 LIFE-001: schedule cancellation, due publication, failure retention and replay use real D1 jobs', async () => {
    const { owner, containerId } = await scenario();
    await profile(owner, { 'page.lifecycle.v1': 'draft-then-publish' });
    const make = () => createPage(owner, { operationKey: key('schedule-page'), containerId, title: 'Scheduled content' });
    const a = await make();
    const due = new Date(Date.parse(owner.now) + 60000).toISOString();
    const s = await publishPage(owner, a.value.pageId, { operationKey: key('schedule'), expectedRevisionId: a.receipt.revisionId, publishAt: due });
    expect((await readPage(owner, a.value.pageId)).page.lifecycle).toBe('scheduled');
    await cancelSchedule(owner, a.value.pageId, { operationKey: key('cancel'), expectedRevisionId: s.receipt.revisionId });
    expect((await readPage(owner, a.value.pageId)).publishedRevisionId).toBeNull();
    const b = await make();
    await publishPage(owner, b.value.pageId, { operationKey: key('due'), expectedRevisionId: b.receipt.revisionId, publishAt: due });
    await runContentJobs(env, due);
    const published = await readPage(owner, b.value.pageId);
    expect(published.page.lifecycle).toBe('live');
    await runContentJobs(env, due);
    expect((await readPage(owner, b.value.pageId)).publishedRevisionId).toBe(published.publishedRevisionId);
    expect((await readPage(owner, a.value.pageId)).page.lifecycle).toBe('draft');
    const c = await make();
    await publishPage(owner, c.value.pageId, { operationKey: key('failed'), expectedRevisionId: c.receipt.revisionId, publishAt: due });
    await env.DB.prepare("UPDATE members SET status='removed' WHERE id=?").bind(owner.actor.id).run();
    await runContentJobs(env, due);
    expect(await rows('SELECT lifecycle FROM pages WHERE id=?', c.value.pageId)).toEqual([{ lifecycle: 'scheduled' }]);
    expect(await rows('SELECT state,failure FROM content_schedules WHERE page_id=?', c.value.pageId)).toEqual([{ state: 'failed', failure: 'The scheduling member is no longer active.' }]);
});
test('REV-003 REV-005 REV-006 REV-007: restore keeps grant identity, intermediate deletion tombstones, current ACL prevents historic reads', async () => {
    const { owner, reader, containerId } = await scenario();
    await profile(owner, { 'page.version.v1': 'labelled' });
    const p = await createPage(owner, { operationKey: key('create'), containerId, title: 'Original' }), id = p.value.pageId;
    const g = await saveGrant(owner, { operationKey: key('grant'), targetKind: 'page', targetId: id, principalKind: 'member', principalId: reader.actor.id, level: 'view' });
    const a = await publishPage(owner, id, { operationKey: key('publish'), expectedRevisionId: p.receipt.revisionId, label: 'Retained' });
    const changed = await updatePage(owner, id, { operationKey: key('update'), expectedRevisionId: a.receipt.revisionId, properties: { title: 'Intermediate' } });
    const b = await publishPage(owner, id, { operationKey: key('numbered-middle'), expectedRevisionId: changed.receipt.revisionId, label: 'Intermediate numbered version' });
    const c = await updatePage(owner, id, { operationKey: key('update'), expectedRevisionId: b.receipt.revisionId, properties: { title: 'Latest' } });
    await expect(deleteRevision(owner, id, c.receipt.revisionId, { operationKey: key('deny-delete') })).rejects.toMatchObject({ code: 'CURRENT_REVISION' });
    await deleteRevision(owner, id, b.receipt.revisionId, { operationKey: key('delete') });
    expect(await readRevision(owner, id, b.receipt.revisionId)).toMatchObject({ deleted: true, ordinal: 2 });
    const restored = await restorePageRevision(owner, id, a.receipt.revisionId, { operationKey: key('restore'), expectedRevisionId: c.receipt.revisionId });
    expect(restored.receipt.revisionId).not.toBe(a.receipt.revisionId);
    expect((await readPage(owner, id)).page.title).toBe('Original');
    expect((await readRevision(reader, id, a.receipt.revisionId)).properties.title).toBe('Original');
    await saveGrant(owner, { operationKey: key('revoke'), targetKind: 'page', targetId: id, id: g.value.id, principalKind: 'member', principalId: reader.actor.id, level: 'view', revoke: true });
    await expect(readRevision(reader, id, a.receipt.revisionId)).rejects.toMatchObject({ status: 404 });
});
