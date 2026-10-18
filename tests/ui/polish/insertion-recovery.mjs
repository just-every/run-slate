import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { openNavigation } from '../../qualification/ui-convergence/browser-support.mjs';
import { call } from '../../qualification/ui-convergence/two-people-support.mjs';
import { withHeldResponse, withPausedCollaboration } from './editor-focus-transport.mjs';

/** Lose a real creation receipt, then return to later saved collaboration content. */
export async function insertionRecoveryJourney({ page, context, origin }, containerId) {
  async function request(method, route, data) {
    const result = await call(context, origin, method, route, data);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body;
  }
  const editor = page.locator('[data-page-editor]');
  const heading = () => editor.locator('[data-block-id]').getByRole('textbox', { name: 'Heading level 1', exact: true });
  const savedText = 'Morgan confirmed the database is healthy. Resume customer updates.';
  const neighbourText = 'Alex owns the next incident review and the follow-up checklist.';
  const localText = 'My unsaved handover: check the replica before restarting writes.';
  for (const conflict of [false, true]) {
    const created = await request('POST', '/api/pages', {
      operationKey: randomUUID(), containerId, title: conflict ? 'Recovered incident handover conflict' : 'Recovered incident handover',
      blocks: [{ id: randomUUID(), blockType: 'paragraph', content: { text: [] }, treePosition: 'a' }],
    });
    const pageId = created.value.pageId;
    await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
    await withPausedCollaboration(page, pageId, async () => {
      await withHeldResponse(page, `/api/pages/${pageId}/blocks`, 'PUT', async gate => {
        await editor.getByRole('textbox', { name: 'Paragraph', exact: true }).click();
        await page.keyboard.press('/');
        await page.getByRole('option', { name: /^Heading 1\s*#$/, exact: true }).click();
        await gate.arrived;
        await expect(heading()).toBeFocused();
        if (conflict) await page.keyboard.insertText(localText);
        await openNavigation(page);
        await page.locator('.navlink').filter({ hasText: /^Search/ }).click();
        await expect(page).toHaveURL(`${origin}/app/search`);
        gate.release();
        await gate.finished;
      }, { disconnect: true });
    });
    // Genuine writes advance the saved block and add a neighbour while this
    // tab is away. The retained insertion snapshot contains neither change.
    const before = await request('GET', `/api/pages/${pageId}`), first = before.blocks[0];
    await request('PATCH', `/api/pages/${pageId}/blocks/${first.id}`, {
      operationKey: randomUUID(), expectedRevisionId: first.revisionId,
      content: { ...first.content, text: [{ text: savedText }] },
    });
    const after = await request('GET', `/api/pages/${pageId}`);
    await request('PUT', `/api/pages/${pageId}/blocks`, {
      operationKey: randomUUID(), expectedRevisionId: after.page.revisionId,
      blocks: [
        ...after.blocks.map(({ id, blockType, content, parentBlockId, treePosition }) => ({ id, blockType, content, parentBlockId, treePosition })),
        { id: randomUUID(), blockType: 'paragraph', content: { text: [{ text: neighbourText }] }, treePosition: 'z' },
      ],
    });
    await page.goBack({ waitUntil: 'networkidle' });
    await expect(heading()).toHaveText(savedText);
    await expect(editor.getByRole('textbox', { name: 'Paragraph', exact: true })).toHaveText(neighbourText);
    const recovered = page.getByRole('region', { name: 'Recovered block conflict', exact: true });
    if (conflict) {
      await expect(recovered).toBeVisible();
      await recovered.getByText('Your recovered blocks', { exact: true }).click();
      await expect(recovered).toContainText(localText);
      await expect(heading()).toHaveAttribute('contenteditable', 'false');
      await expect(page.getByRole('button', { name: 'Try saving inserted blocks again', exact: true })).toHaveCount(0);
      await page.screenshot({ path: `.artifacts/ui-convergence/recovery-conflict-${page.viewportSize().width}.png`, fullPage: true });
      await recovered.getByRole('button', { name: 'Use saved blocks', exact: true }).click();
      await expect(recovered).toHaveCount(0);
    } else {
      await expect(recovered).toHaveCount(0);
    }
    await expect(page.locator('.editor-save-status')).toHaveCount(0);
    await expect(heading()).toHaveAttribute('contenteditable', 'true');
    await page.screenshot({ path: `.artifacts/ui-convergence/recovery-saved-${conflict ? 'discarded' : 'empty'}-${page.viewportSize().width}.png`, fullPage: true });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(heading()).toHaveText(savedText);
    await expect(editor.getByRole('textbox', { name: 'Paragraph', exact: true })).toHaveText(neighbourText);
    const saved = await request('GET', `/api/pages/${pageId}`);
    assert.equal(saved.blocks[0].content.text.map(span => span.text).join(''), savedText);
    assert.equal(saved.blocks.length, 2);
  }
}
