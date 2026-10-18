import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { expect } from '@playwright/test';
import { grant, ok } from './two-people-support.mjs';
import { openPageAction } from './browser-support.mjs';

export async function exportCommentsJourney(state, people) {
  const { page, context, origin, api } = state;
  const width = page.viewportSize().width;
  const space = (await api('/api/containers')).items.find(item => item.name === 'Handbook');
  const blockId = randomUUID(), anchorId = randomUUID();
  const { value: { pageId } } = await ok(context, origin, 'POST', '/api/pages', { operationKey: randomUUID(), containerId: space.id, title: 'Customer incident handover', blocks: [{ id: blockId, blockType: 'paragraph', content: { text: [{ text: 'Confirm the recovery owner', commentAnchorId: anchorId }, { text: ' before handing the incident to the next shift.' }] }, treePosition: 'a' }] });
  await grant(context, origin, pageId, people.bob.id, 'comment');
  const source = await api(`/api/pages/${pageId}`);
  const first = (await ok(context, origin, 'POST', `/api/comments/page/${pageId}`, { operationKey: randomUUID(), kind: 'inline', blockId, anchor: { anchorId, quote: 'Confirm the recovery owner' }, anchorRevisionId: source.workingRevisionId, body: [{ text: 'Who will coordinate the next customer update?' }] })).value;
  await ok(people.bob.context, origin, 'POST', `/api/comments/page/${pageId}`, { operationKey: randomUUID(), threadId: first.threadId, parentCommentId: first.id, body: [{ text: 'Morgan will send the update at the next handover.' }] });
  await ok(context, origin, 'POST', `/api/comments/page/${pageId}`, { operationKey: randomUUID(), body: [{ text: 'Keep this timeline with the incident report.' }] });
  const discussion = await api(`/api/comments/page/${pageId}`);
  await ok(context, origin, 'POST', `/api/comments/thread/${first.threadId}/resolve`, { operationKey: randomUUID(), expectedRevisionId: discussion.threads.find(t => t.id === first.threadId).revision_id, resolved: true });
  async function download(format, label) {
    const dialog = page.getByRole('dialog', { name: 'Export readable content', exact: true });
    await dialog.getByLabel('Format', { exact: true }).selectOption(format);
    await expect(dialog).toContainText('comment authors');
    await page.screenshot({ path: `.artifacts/ui-convergence/export-comments-${width}-${label}-dialog.png` });
    const pending = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download export', exact: true }).click();
    const file = await pending;
    const bytes = await readFile(await file.path());
    await expect(dialog).toHaveCount(0);
    return bytes;
  }
  for (const format of ['html', 'markdown']) {
    await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Export page', exact: true }).click();
    const bytes = await download(format, format);
    const entries = unzipSync(bytes), manifest = JSON.parse(new TextDecoder().decode(entries['slate-readable.json']));
    const archived = manifest.pages.find(p => p.id === pageId).comments;
    assert.equal(archived.threads.length, 2);
    assert.equal(archived.threads.find(t => t.kind === 'inline').state, 'resolved');
    assert.deepEqual(JSON.parse(new TextDecoder().decode(entries[`pages/${pageId}.comments.json`])), archived);
    if (format === 'html') {
      const output = await context.newPage();
      try {
        await output.setContent(new TextDecoder().decode(entries[`pages/${pageId}.html`]));
        await expect(output.getByRole('region', { name: 'Comments', exact: true })).toContainText('Alex Owner');
        await expect(output.getByRole('region', { name: 'Comments', exact: true })).toContainText('Morgan Reader');
        await expect(output.getByRole('link', { name: 'Inline thread', exact: true })).toHaveAttribute('href', `#slate-block-${blockId}`);
        await output.getByRole('link', { name: 'Inline thread', exact: true }).click();
        await expect(output.locator(`#slate-block-${blockId}`)).toBeInViewport();
        await output.screenshot({ path: `.artifacts/ui-convergence/export-comments-${width}-html.png`, fullPage: true });
      } finally { await output.close(); }
    }
    const previous = new Set((await api('/api/pages')).items.map(p => p.id));
    await page.goto(`${origin}/app/settings?section=portability`, { waitUntil: 'networkidle' });
    const form = page.locator('.portability-panel > form');
    await form.getByRole('combobox', { name: /^Format/ }).selectOption('slate-readable');
    await form.getByLabel('File', { exact: true }).setInputFiles({ name: `handover-${format}.zip`, mimeType: 'application/zip', buffer: bytes });
    await form.getByRole('button', { name: 'Upload and review', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Import · completed', exact: true })).toBeVisible();
    await page.screenshot({ path: `.artifacts/ui-convergence/export-comments-${width}-${format}-import.png`, fullPage: true });
    const copy = (await api('/api/pages')).items.find(p => !previous.has(p.id) && p.title === 'Customer incident handover');
    assert.ok(copy);
    await page.goto(`${origin}/app/pages/${copy.id}`, { waitUntil: 'networkidle' });
    await openPageAction(page, 'Comments');
    await expect(page.locator('.comment-thread')).toHaveCount(2);
    await expect(page.locator('.right')).toContainText('Morgan Reader');
    await expect(page.locator('.right')).toContainText('Who will coordinate the next customer update?');
    await expect(page.locator('.right')).toContainText('Resolved');
    const restored = await api(`/api/comments/page/${copy.id}`);
    assert.equal(restored.threads.find(t => t.kind === 'inline').block_id, (await api(`/api/pages/${copy.id}`)).blocks[0].id);
    assert.deepEqual(restored.comments.map(c => [c.authorDisplayName, c.createdAt, c.body]), discussion.comments.map(c => [c.authorDisplayName, c.createdAt, c.body]));
    await page.screenshot({ path: `.artifacts/ui-convergence/export-comments-${width}-${format}-restored.png`, fullPage: true });
  }
  await page.goto(`${origin}/app/settings?section=portability`, { waitUntil: 'networkidle' });
  for (const item of (await api('/api/pages')).items) {
    const response = await context.request.post(origin + '/api/exports/readable', { headers: { origin }, data: { scope: 'page', id: item.id, format: 'html' } });
    assert.equal(response.status(), 200, `Export ${item.title}: ${response.status() === 200 ? '' : await response.text()}`);
  }
  await page.getByRole('button', { name: 'Export readable workspace', exact: true }).click();
  const workspace = await download('html', 'workspace');
  assert.ok(JSON.parse(new TextDecoder().decode(unzipSync(workspace)['slate-readable.json'])).pages.length >= 4);
}
