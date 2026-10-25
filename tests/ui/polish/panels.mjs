import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { closeDetails, openPageAction } from '../../qualification/ui-convergence/browser-support.mjs';
import { capture, control, menuEntry, separated, labelsDoNotOverlap } from './evidence.mjs';

export async function pagePanelsJourney({ page, origin, api, modelRequests }, pageId) {
  await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  const more = page.getByRole('button', { name: 'More', exact: true });
  await expect(more).toHaveAttribute('aria-haspopup', 'menu');
  await more.click();
  const menu = page.getByRole('menu');
  const panel = page.locator('.right');
  const favourite = menu.getByRole('menuitem', { name: /^(Add to|Remove from) favourites$/ });
  const watch = menu.getByRole('menuitem', { name: /^(Watch this page|Stop watching)$/ });
  // Creating and editing now autowatches this page (PAGE-016). Establish the
  // explicit opt-out before exercising the existing watch/unwatch cycle.
  await expect(watch).toHaveAccessibleName('Stop watching');
  await expect.poll(async () => (await api('/api/navigation')).watches.includes(pageId)).toBe(true);
  await watch.click();
  await expect(watch).toBeEnabled(); await expect(watch).toHaveAccessibleName('Watch this page');
  await expect.poll(async () => (await api('/api/navigation')).watches.includes(pageId)).toBe(false);
  await menuEntry(favourite, 'Page Favourite'); await menuEntry(watch, 'Page Watch'); await separated([favourite, watch], 'Favourite and Watch', { gap: 0 });
  await labelsDoNotOverlap(menu); await capture(page, 'more-menu', { fullPage: true });
  await expect(menu.getByRole('menuitem', { name: 'Add icon', exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Add cover', exact: true })).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Add icon', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Page icon', exact: true })).toBeVisible();
  await capture(page, 'more-dialog-icon', { fullPage: true, requiredControls: ['Save appearance'] });
  await page.getByRole('dialog', { name: 'Page icon', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await more.click();
  await menu.getByRole('menuitem', { name: 'Display settings', exact: true }).click();
  await panel.getByRole('button', { name: 'Save display settings', exact: true }).scrollIntoViewIfNeeded();
  await capture(page, 'more-panel-display', { fullPage: true, requiredControls: ['Save display settings'] });
  await closeDetails(page);
  await openPageAction(page, 'Details');
  await panel.locator('summary').filter({ hasText: /^Readership$/ }).click();
  await expect(panel.getByRole('button', { name: 'Apply dates', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Apply dates', exact: true }).scrollIntoViewIfNeeded();
  await capture(page, 'more-panel-readership', { fullPage: true, requiredControls: ['Apply dates'] });
  await closeDetails(page);
  await more.click();
  await watch.click();
  await expect(watch).toBeEnabled(); await expect(watch).toHaveAccessibleName('Stop watching');
  await expect.poll(async () => (await api('/api/navigation')).watches.includes(pageId)).toBe(true);
  await menuEntry(favourite, 'Page Favourite'); await menuEntry(watch, 'Page Watch'); await separated([favourite, watch], 'Favourite and Watch', { gap: 0 });
  await labelsDoNotOverlap(menu); await capture(page, 'more-menu-watched', { fullPage: true });
  await watch.click();
  await expect(watch).toBeEnabled(); await expect(watch).toHaveAccessibleName('Watch this page');
  await expect.poll(async () => (await api('/api/navigation')).watches.includes(pageId)).toBe(false);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const copy = panel.getByRole('button', { name: 'Copy page link', exact: true });
  await control(copy, 'Copy link'); await labelsDoNotOverlap(panel); await capture(page, 'share-panel', { fullPage: true });
  await panel.getByRole('combobox', { name: /^Invite someone/ }).selectOption('member:browser-reader');
  await panel.getByRole('button', { name: 'Share page', exact: true }).click();
  await expect.poll(async () => (await api(`/api/sharing/pages/${pageId}`)).items.some(grant => grant.principalId === 'browser-reader')).toBe(true);
  await panel.locator('summary').filter({ hasText: /^Invite by email$/ }).click();
  await panel.locator('summary').filter({ hasText: /^Advanced access$/ }).click();
  await panel.locator('summary').filter({ hasText: /^Expiry & removal$/ }).first().click();
  await expect(panel.getByRole('button', { name: 'Record invitation locally', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Remove access', exact: true }).first()).toBeVisible();
  await panel.getByRole('button', { name: 'Record invitation locally', exact: true }).scrollIntoViewIfNeeded();
  await capture(page, 'share-panel-expanded', { fullPage: true, requiredControls: ['Record invitation locally'] });
  await panel.getByRole('button', { name: 'Remove access', exact: true }).first().scrollIntoViewIfNeeded();
  await capture(page, 'share-panel-removal', { fullPage: true, requiredControls: ['Remove access'] });
  await closeDetails(page);
  await openPageAction(page, 'Ask');
  const allowance = panel.locator('summary').filter({ hasText: /^AI allowance$/ });
  await control(allowance, 'AI allowance summary');
  await expect(allowance.locator('..')).toHaveAttribute('open', '');
  await expect(panel).toContainText('Connect an AI provider');
  await expect(page.getByRole('button', { name: 'Ask Slate', exact: true })).toBeDisabled();
  const availability = await api('/api/ai/availability'); assert.equal(availability.providerConfigured, false); assert.equal(availability.enabled, false);
  await panel.getByRole('textbox', { name: 'Your question', exact: true }).fill('Explain this page without dispatching unavailable AI.');
  await expect(page.getByRole('button', { name: 'Ask Slate', exact: true })).toBeDisabled();
  assert.equal((await api('/api/runs')).items.length, 0, 'Allowance view starts no model run');
  assert.deepEqual(modelRequests, [], 'Typing with unavailable AI submits no model work');
  await capture(page, 'ai-allowance', { fullPage: true });
  await allowance.click(); await expect(allowance.locator('..')).not.toHaveAttribute('open', '');
  await capture(page, 'ai-allowance-collapsed', { fullPage: true });
  await allowance.click(); await expect(allowance.locator('..')).toHaveAttribute('open', '');
  await closeDetails(page);
}

const plain = body => (body ?? []).map(span => span.text ?? '').join('');
async function assertAlertInView(alert) {
  const visibility = await alert.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const covered = [];
    for (const horizontal of [0.05, 0.5, 0.95]) {
      for (const vertical of [0.05, 0.5, 0.95]) {
        const x = rect.left + rect.width * horizontal;
        const y = rect.top + rect.height * vertical;
        const hit = document.elementFromPoint(x, y);
        if (!hit || !element.contains(hit)) covered.push({ x, y, hit: hit?.tagName ?? null });
      }
    }
    return { box: rect.toJSON(), viewport: { width: innerWidth, height: innerHeight }, covered };
  });
  const { box, viewport, covered } = visibility;
  assert.ok(box.width > 0 && box.height > 0 && box.left >= 0 && box.top >= 0 && box.right <= viewport.width && box.bottom <= viewport.height,
    `Offline alert is fully inside the current viewport without scrolling (${JSON.stringify(visibility)})`);
  assert.deepEqual(covered, [], 'Offline alert is uncovered across its visible surface without scrolling');
}
export async function commentsFailureJourney({ page, context, origin, api }, pageId) {
  await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Comments', exact: true }).click();
  const composer = page.getByRole('textbox', { name: 'Comment text', exact: true });
  const send = page.getByRole('button', { name: 'Send comment', exact: true });
  for (const value of ['First real discussion to resolve.', 'Second real discussion to resolve.']) {
    await composer.fill(value); await expect(send).toBeEnabled(); await send.click(); await expect(composer).toBeEmpty();
  }
  await expect.poll(async () => (await api(`/api/comments/page/${pageId}`)).threads.length).toBe(2);
  const resolve = page.getByRole('button', { name: 'Resolve all open threads', exact: true });
  await expect(page.locator('.comment-thread')).toHaveCount(2);
  await resolve.scrollIntoViewIfNeeded(); await control(resolve, 'Resolve all');
  const fullDocument = { fullPage: true, requiredDocumentControls: page.viewportSize().width === 390 ? ['＋ Add block'] : [] };
  await capture(page, 'comments-resolve', fullDocument);
  await resolve.click();
  await expect.poll(async () => (await api(`/api/comments/page/${pageId}`)).threads.every(thread => thread.state === 'resolved')).toBe(true);
  await expect(resolve).toHaveCount(0);
  await expect(page.locator('.comment-thread .thread-heading > span')).toHaveText(['Resolved', 'Resolved']);
  await capture(page, 'comments-resolved', fullDocument);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.comment-thread')).toHaveCount(2);
  await expect(page.locator('.comment-thread .thread-heading > span')).toHaveText(['Resolved', 'Resolved']);
  assert.ok((await api(`/api/comments/page/${pageId}`)).threads.every(thread => thread.state === 'resolved'), 'Resolve all remains stored after reload');
  await capture(page, 'comments-resolved-reloaded', fullDocument);
  const draft = 'Exact offline draft: keep  two spaces & punctuation — retry once.';
  const before = await api(`/api/comments/page/${pageId}`);
  const refresh = page.getByRole('button', { name: 'Retry page refresh', exact: true });
  const refreshAlert = page.getByRole('alert').filter({ has: refresh });
  await composer.fill(draft);
  await context.setOffline(true);
  try {
    await send.click();
    const alert = page.locator('.comments-panel').getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).not.toHaveText(/^\s*$/);
    await expect(alert).toContainText('Your draft is kept. Choose Send comment to retry.');
    await assertAlertInView(alert);
    await expect(composer).toHaveText(draft);
    assert.equal(await composer.textContent(), draft, 'Offline failure preserves every draft character');
    await expect(send).toBeEnabled();
    // The real collaboration poll shares the page read boundary. Its retained
    // transport failure must be installed before the capture's control sweep.
    await expect(refresh).toHaveCount(1, { timeout: 15000 });
    await expect(refreshAlert).toContainText('Refresh failed. Current server state is unconfirmed. Your unsaved edits remain here.');
    await assertAlertInView(alert);
    await capture(page, 'comments-offline', {
      ...fullDocument,
      // The phone's fixed comments panel covers this background page control;
      // keep its original clipping in the sweep, and require the exposed desktop control.
      requiredControls: page.viewportSize().width === 1440 ? ['Retry page refresh'] : [],
    });
  } finally { await context.setOffline(false); }
  // A genuine successful background page read clears the retained failure.
  // Reconnecting alone must neither clear it early nor submit the comment draft.
  await expect(refresh).toHaveCount(0, { timeout: 15000 });
  await expect(refreshAlert).toHaveCount(0);
  const reconnected = await api(`/api/comments/page/${pageId}`);
  assert.equal(reconnected.comments.length, before.comments.length, 'Restoring transport does not send the draft');
  await expect(composer).toHaveText(draft); await expect(send).toBeEnabled();
  assert.equal(await composer.textContent(), draft, 'Reconnect preserves every draft character before explicit retry');
  await send.click(); await expect(composer).toBeEmpty();
  await expect.poll(async () => (await api(`/api/comments/page/${pageId}`)).comments.filter(comment => plain(comment.body) === draft).length).toBe(1);
  const after = await api(`/api/comments/page/${pageId}`);
  assert.equal(after.comments.length, before.comments.length + 1, 'Explicit retry stores exactly one new comment');
  await expect(send).toBeDisabled(); await capture(page, 'comments-retry', fullDocument);
  await page.reload({ waitUntil: 'networkidle' });
  const persisted = await api(`/api/comments/page/${pageId}`);
  assert.equal(persisted.comments.filter(comment => plain(comment.body) === draft).length, 1);
  await expect(composer).toBeEmpty();
  await closeDetails(page);
}
