import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { ok } from '../qualification/ui-convergence/two-people-support.mjs';
import { setupWorkspace, withWorkspace } from '../qualification/ui-convergence/browser-support.mjs';
import { spacesJourney, settingsJourney, navigationAndSearch } from './polish/workspace.mjs';
import { sharedHeaderJourney } from './polish/header.mjs';
import { editorJourney } from './polish/editor.mjs';
import { editorFocusJourney } from './polish/editor-focus.mjs';
import { insertionRecoveryJourney } from './polish/insertion-recovery.mjs';
import { mentionTypingJourney } from './polish/mentions.mjs';
import { assertCaptureInventory } from './polish/inventory.mjs';
import { pagePanelsJourney, commentsFailureJourney } from './polish/panels.mjs';

// The qualification harness seeds identity only. Setup, content, comments and all
// reads/writes use the emitted Worker, real API, real browser and persisted D1.
// Offline mode blocks transport; focus barriers forward genuine Worker responses.
for (const width of [1440, 390]) {
  test(`insertion recovery preserves later saved content at ${width}px`, { timeout: 180000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      const page = (await state.api('/api/pages')).items.find(page => page.title === 'Welcome');
      assert.ok(page);
      await insertionRecoveryJourney(state, page.containerId);
    });
  });
  test(`visible Slate polish and genuine failure/retry at ${width}px`, { timeout: 420000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'flagship', async state => {
      await setupWorkspace(state);
      const pageId = (await state.api('/api/pages')).items.find(page => page.title === 'Welcome')?.id;
      assert.ok(pageId, 'Real first run created the page used by these journeys');
      await spacesJourney(state);
      await settingsJourney(state, width);
      await navigationAndSearch(state, width);
      await sharedHeaderJourney(state, pageId);
      await editorJourney(state, pageId, width);
      await pagePanelsJourney(state, pageId);
      await commentsFailureJourney(state, pageId);
      assertCaptureInventory(width);
      assert.deepEqual(state.modelRequests, [], 'Flagship polish does not submit model work');
    });
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await controlPolishJourney(state, width);
    });
  });
  test(`genuine insertion focus lifecycle at ${width}px`, { timeout: 240000 }, async () => {
    // Isolate this new journey's authoring from the original suite's request
    // budget; each workspace still runs the production rate limits unchanged.
    for (const part of ['insertion', 'navigation', 'formatting']) {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'flagship', async state => {
      await setupWorkspace(state);
      const page = (await state.api('/api/pages')).items.find(page => page.title === 'Welcome');
      assert.ok(page, 'Real first run supplies the lifecycle journey container');
      await editorFocusJourney(state, page.containerId, part);
      assert.deepEqual(state.modelRequests, [], 'Insertion focus does not submit model work');
    });
    }
    // A distinct workspace keeps this core flow within the real request budget
    // after the insertion journey's deliberate failures and repeated reads.
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      const page = (await state.api('/api/pages')).items.find(page => page.title === 'Welcome');
      assert.ok(page, 'Real first run supplies the mention journey page');
      await state.page.goto(`${state.origin}/app/pages/${page.id}`, { waitUntil: 'networkidle' });
      await mentionTypingJourney(state, page.id);
      assert.deepEqual(state.modelRequests, [], 'Mention editing does not submit model work');
    });
  });
}

// Extend the existing polish registration: paging and tooltips at desktop,
// phone-only review targets at phone width, all through the emitted Worker.
async function controlPolishJourney({ page, context, origin, api }, width) {
  const containerId = (await api('/api/containers')).items.find(space => space.name === 'Handbook').id;
  const post = (route, data) => ok(context, origin, 'POST', route, { operationKey: randomUUID(), ...data });
  const blockId = randomUUID();
  const pageId = (await post('/api/pages', { containerId, title: 'Release review', blocks: [{ id: blockId, blockType: 'task', treePosition: '0', content: { text: [{ text: 'Check release notes' }], done: false } }] })).value.pageId;
  await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  if (width === 1440) {
    const checkbox = page.getByRole('checkbox', { name: 'Mark complete: Check release notes', exact: true });
    const name = await checkbox.getAttribute('aria-label');
    await expect(checkbox).toHaveAttribute('data-tooltip', name);
    await page.mouse.move(0, 0);
    await checkbox.hover();
    await expect.poll(() => checkbox.evaluate(el => getComputedStyle(el, '::after').opacity)).toBe('1');
    const hover = await checkbox.evaluate(el => { const s = getComputedStyle(el, '::after'); return { text: s.content, delay: s.transitionDelay, pointerEvents: s.pointerEvents }; });
    assert.equal(JSON.parse(hover.text), name);
    assert.equal(hover.delay, '0.3s');
    assert.equal(hover.pointerEvents, 'none');
    await page.mouse.move(0, 0);
    await page.keyboard.press('Tab');
    await checkbox.focus();
    await expect.poll(() => checkbox.evaluate(el => getComputedStyle(el, '::after').opacity)).toBe('1');
    assert.equal(await checkbox.evaluate(el => getComputedStyle(el, '::after').transitionDelay), '0s');
    await page.keyboard.press('Space');
    await expect(checkbox).toBeChecked();
    await expect.poll(async () => (await api(`/api/pages/${pageId}`)).blocks[0].content.done).toBe(true);
    for (let i = 0; i < 30; i++) await post('/api/pages', { containerId, title: `Release guide ${i + 1}` });
    await page.goto(origin + '/app/search?q=&kind=page', { waitUntil: 'networkidle' });
    const next = page.getByRole('button', { name: 'Next results →', exact: true });
    const save = page.getByRole('button', { name: 'Save this search', exact: true });
    await expect(next).toBeVisible();
    const a = await next.boundingBox(), b = await save.boundingBox();
    assert.ok(b.x - a.x - a.width >= 8, 'SL33 paging and save have a real 8px gap');
    assert.ok(Math.max(a.y, b.y) < Math.min(a.y + a.height, b.y + b.height), 'SL33 actions share one row');
    await next.click();
    await expect(next).toHaveCount(0);
    await save.click();
    await expect(page.getByRole('dialog')).toBeVisible();
  } else {
    await post('/api/status', { key: 'verified', label: 'Verified', color: '#228855', requiresVerification: true });
    let document = await api(`/api/pages/${pageId}`);
    await post(`/api/status/page/${pageId}`, { expectedRevisionId: document.page.revisionId, statusKey: 'verified', attestRevisionId: document.workingRevisionId, expiresInDays: 30 });
    document = await api(`/api/pages/${pageId}`);
    await ok(context, origin, 'PUT', `/api/pages/${pageId}/blocks`, { operationKey: randomUUID(), expectedRevisionId: document.page.revisionId, blocks: [{ id: blockId, blockType: 'task', treePosition: '0', content: { text: [{ text: 'Check release notes today' }], done: false } }] });
    await page.reload({ waitUntil: 'networkidle' });
    await page.goto(origin + '/app/review', { waitUntil: 'networkidle' });
    const row = page.locator('.review-list li').filter({ hasText: 'Release review' });
    const title = row.getByRole('link', { name: 'Release review', exact: true });
    const checkbox = row.getByRole('checkbox', { name: 'Select Release review', exact: true });
    await expect(checkbox).toBeEnabled();
    const linkBox = await title.boundingBox(), checkBox = await checkbox.boundingBox();
    assert.ok(linkBox.height >= 44, 'SL34 title has a 44px phone target');
    assert.ok(checkBox.width >= 44 && checkBox.height >= 44, 'SL34 selection has a 44px square phone target');
    await checkbox.click({ position: { x: 2, y: 2 } });
    await expect(checkbox).toBeChecked();
    await expect(page.getByRole('button', { name: 'Verify selected opened revisions', exact: true })).toBeEnabled();
    await title.click({ position: { x: 2, y: 2 } });
    await expect(page.getByRole('textbox', { name: 'Page title', exact: true })).toHaveValue('Release review');
  }
}
