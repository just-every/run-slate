import { env, SELF } from 'cloudflare:test';
import { test, expect } from 'vitest';
import { scenario, key, rows, textBlock, profile } from './helpers';
import { createPage, readPage } from '../../../src/core/features/pages/service';
import { replaceBlocks } from '../../../src/core/features/editor/service';
import { uploadMedia, serveMedia } from '../../../src/core/features/media/service';
import { contentLimits } from '../../../src/core/features/editor/limits';
import { compareRevisions } from '../../../src/core/features/versions/compare';
import { saveGrant } from '../../../src/core/features/sharing/grants';
import { sessionFor } from '../../e2e/setup/fixtures';
for (const versions of ['autosnapshot', 'labelled'] as const)
    test(`REV-001 REV-004 REV-007: ${versions} immutable diff categorizes added removed changed blocks and NFC content hash`, async () => {
        const { owner, containerId } = await scenario();
        await profile(owner, { 'page.version.v1': versions });
        const a = textBlock(key('a'), 'café'), b = { ...textBlock(key('b'), 'Removed'), treePosition: '2' };
        const p = await createPage(owner, { operationKey: key('create'), containerId, title: 'Hash', blocks: [a, b] });
        const next = await replaceBlocks(owner, p.value.pageId, { operationKey: key('replace'), expectedRevisionId: p.receipt.revisionId, blocks: [{ ...a, content: { text: [{ text: 'Changed' }] } }, { ...textBlock(key('c'), 'Added'), treePosition: '3' }] });
        const diff = await compareRevisions(owner, p.value.pageId, p.receipt.revisionId, next.receipt.revisionId);
        expect(diff.blocks.map(b => b.change).sort()).toEqual(['added', 'changed', 'removed']);
        expect(diff.blocks.find(b => b.id === a.id)?.before?.content).toEqual(a.content);
        const revision = (await rows('SELECT content_hash FROM page_revisions WHERE id=?', p.receipt.revisionId))[0];
        const expected = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('café Removed Hash'))), b => b.toString(16).padStart(2, '0')).join('');
        expect(revision.content_hash).toBe(expected);
    });
test('BASE-INPUT-001 BASE-INPUT-002 BASE-INPUT-003 BLOCK-008: actual HTTP rejects malformed write, real R2 type/size/sanitization and current access govern delivery', async () => {
    const { owner, reader, containerId } = await scenario();
    const p = await createPage(owner, { operationKey: key('page'), containerId, title: 'Safe files' });
    const cookie = await sessionFor(owner.actor.id);
    const invalid = await SELF.fetch('http://localhost/api/pages', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost' }, body: JSON.stringify({ operationKey: key('invalid'), containerId, title: [], unexpected: 'not accepted' }) });
    expect(invalid.status).toBe(400);
    expect(await rows('SELECT id FROM pages WHERE workspace_id=?', owner.actor.workspaceId)).toHaveLength(1);
    for (const input of [{ contentType: 'application/x-executable', bytes: new Uint8Array(1), code: 'UNSUPPORTED_FILE_TYPE' }, { contentType: 'text/plain', bytes: new Uint8Array(contentLimits.uploadBytesPerFile + 1), code: 'FILE_TOO_LARGE' }])
        await expect(uploadMedia(owner, { operationKey: key('reject'), pageId: p.value.pageId, name: 'bad', ...input })).rejects.toMatchObject({ code: input.code });
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image href="https://tracker.invalid/pixel"/><rect width="12" height="12" onload="alert(2)"/><foreignObject><form/></foreignObject></svg>';
    const file = await uploadMedia(owner, { operationKey: key('svg'), pageId: p.value.pageId, name: 'safe.svg', contentType: 'image/svg+xml', bytes: new TextEncoder().encode(source) });
    const response = await serveMedia(owner, file.value.id);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(response.headers.get('content-disposition')).toContain('attachment');
    const sanitized = await response.text();
    expect(sanitized).toContain('<rect');
    expect(sanitized).not.toMatch(/script|image|onload|foreignObject|form|tracker/);
    await expect(serveMedia(reader, file.value.id)).rejects.toMatchObject({ status: 404 });
    await saveGrant(owner, { operationKey: key('reader'), targetKind: 'page', targetId: p.value.pageId, principalKind: 'member', principalId: reader.actor.id, level: 'view' });
    await replaceBlocks(owner, p.value.pageId, { operationKey: key('attach'), expectedRevisionId: p.receipt.revisionId, blocks: [{ id: key('image'), blockType: 'media', treePosition: '1', content: { kind: 'image', source: { fileId: file.value.id, url: file.value.url, name: 'safe.svg' }, caption: '', alt: 'Safe SVG' } }] });
    const read = await serveMedia(reader, file.value.id);
    expect(await read.text()).toBe(sanitized);
});
