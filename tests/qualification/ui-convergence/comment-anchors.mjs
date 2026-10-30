import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { editable, ok } from './two-people-support.mjs';
import { closeDetails, openPageAction } from './browser-support.mjs';

/** Keep the discussion attached while its text is edited, split and moved. */
export async function commentAnchorsJourney(state, pageId, thread) {
  const { page, context, origin } = state;
  const width = page.viewportSize().width;
  const { quote, anchorId } = JSON.parse(thread.anchor_json);
  const anchorSelector = `[data-comment-anchor="${anchorId}"]`;
  const editedQuote = 'Next shift: ' + quote;
  const readThread = async () => (await ok(context, origin, 'GET', `/api/comments/page/${pageId}`)).threads.find(item => item.id === thread.id);
  let blockId = thread.block_id;
  const saved = () => page.waitForResponse(response => response.url().includes(`/api/pages/${pageId}/blocks`) && ['PATCH', 'PUT'].includes(response.request().method()) && response.ok());
  let commit = saved();
  await editable(page, blockId).locator(anchorSelector).evaluate(element => {
    element.closest('[contenteditable]').focus();
    const range = document.createRange(); range.selectNodeContents(element); range.collapse(true);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  await page.keyboard.type('Next shift: ');
  await commit;
  await expect(editable(page, blockId).locator(anchorSelector)).toHaveText(editedQuote);
  await expect(editable(page, blockId).locator(anchorSelector)).toHaveAttribute('data-comment-anchor', JSON.parse(thread.anchor_json).anchorId);
  assert.equal(!!(await readThread()).orphaned, false, 'Editing the selected text retains its thread.');

  // Split before the marked text: the same anchor moves onto the new block.
  await editable(page, blockId).evaluate(element => {
    element.focus();
    const range = document.createRange(); range.selectNodeContents(element); range.collapse(true);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  commit = saved();
  await page.keyboard.press('Enter');
  await commit;
  await expect.poll(async () => (await readThread()).block_id).not.toBe(blockId);
  blockId = (await readThread()).block_id;
  await expect(editable(page, blockId).locator(anchorSelector)).toHaveText(editedQuote);
  assert.equal(!!(await readThread()).orphaned, false, 'Splitting relocates the thread onto its marked text.');
  await page.locator(`[data-block-id="${blockId}"]`).hover();
  await page.locator(`[data-block-id="${blockId}"]`).getByRole('button', { name: /^Block actions for/ }).click();
  commit = saved();
  await page.getByRole('menuitem', { name: 'Move up', exact: true }).click();
  await commit;
  await expect.poll(async () => (await ok(context, origin, 'GET', `/api/pages/${pageId}`)).blocks[0].id).toBe(blockId);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(editable(page, blockId).locator(anchorSelector)).toHaveText(editedQuote);
  assert.equal(!!(await readThread()).orphaned, false, 'Moving the block retains the same anchored thread.');
  await openPageAction(page, 'Comments');
  await page.getByLabel('Threads', { exact: true }).selectOption('resolved');
  const discussion = page.locator(`#thread-${thread.id}`);
  await expect(discussion.getByRole('button', { name: 'Jump to selected text', exact: true })).toBeVisible();
  const anchor = editable(page, blockId).locator(anchorSelector);
  await page.locator('.page-document [data-block-id]').last().scrollIntoViewIfNeeded();
  await expect(anchor).not.toBeInViewport();
  await discussion.getByRole('button', { name: 'Jump to selected text', exact: true }).click();
  await expect(anchor).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: `.artifacts/ui-convergence/comments-${width}-moved-anchor.png`, fullPage: true });
  await closeDetails(page);

  await editable(page, blockId).locator(anchorSelector).evaluate(element => {
    element.closest('[contenteditable]').focus();
    const range = document.createRange(); range.selectNodeContents(element);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  commit = saved();
  await page.keyboard.press('Backspace');
  await commit;
  assert.equal(!!(await readThread()).orphaned, true, 'Deleting selected text orphans the thread instead of deleting it.');
  await page.reload({ waitUntil: 'networkidle' });
  await openPageAction(page, 'Comments');
  await page.getByLabel('Threads', { exact: true }).selectOption('resolved');
  await expect(discussion).toContainText('Please confirm the escalation owner.');
  await expect(discussion).toContainText('Original text is no longer on the page.');
  const revision = discussion.getByRole('link', { name: `Open original revision ${thread.anchor_revision_id}` });
  await expect(revision).toBeVisible();
  assert.equal(new URL(await revision.getAttribute('href'), origin).searchParams.get('revision'), thread.anchor_revision_id);
  await page.screenshot({ path: `.artifacts/ui-convergence/comments-${width}-orphaned.png`, fullPage: true });
  await revision.click();
  await expect(page).toHaveURL(new RegExp(`revision=${thread.anchor_revision_id}`));
  await page.locator('.revision-preview').scrollIntoViewIfNeeded();
  await expect(page.locator('.revision-preview')).toBeVisible();
  await expect(page.locator('.revision-preview')).toContainText(quote);
  await page.screenshot({ path: `.artifacts/ui-convergence/comments-${width}-original-revision.png`, fullPage: true });
  await closeDetails(page);
}
