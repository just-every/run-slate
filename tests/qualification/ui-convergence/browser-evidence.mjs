import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { root } from '../../e2e/runtime-harness.mjs';

let ordinal = 0;
export async function accessible(page, state) {
  await page.waitForLoadState('networkidle');
  const geometry = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight }, documentWidth: document.documentElement.scrollWidth,
    body: document.querySelector('[data-page-editor]')?.getBoundingClientRect().toJSON(),
    toolbar: [...document.querySelectorAll('.topbar .tools button')].map(element => element.getBoundingClientRect().toJSON()),
  }));
  const results = await new AxeBuilder({ page }).analyze();
  const evidence = path.join(root, '.artifacts/ui-convergence/evidence');
  await mkdir(evidence, { recursive: true });
  const name = `${String(++ordinal).padStart(3, '0')}-${geometry.viewport.width}-${state.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  const artifact = JSON.parse(await readFile(path.join(root, '.cache/slate/build-source.json'), 'utf8'));
  await writeFile(path.join(evidence, `${name}.json`), JSON.stringify({ state, url: page.url(), artifact, geometry, axe: results }, null, 2));
  await page.screenshot({ path: path.join(evidence, `${name}.png`), fullPage: true });
  assert.ok(geometry.documentWidth <= geometry.viewport.width, `${state}: horizontal overflow`);
  assert.deepEqual(results.violations.filter(item => ['serious', 'critical'].includes(item.impact))
    .map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })), [], `${state}: accessibility`);
}

/** Visibility alone permits a control to be clipped below a scrolling panel. */
export async function insideViewport(page, locator, label) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(box && box.width > 0 && box.height > 0 && box.x >= 0 && box.y >= 0
    && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, `${label}: entire control is inside the viewport`);
}

/** Hit testing applies to enabled controls; disabled controls may omit pointer events. */
export async function withinViewport(page, locator, label) {
  await expect(locator).toBeEnabled();
  await insideViewport(page, locator, label);
  const unobstructed = await locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit === element || element.contains(hit);
  });
  assert.ok(unobstructed, `${label}: control is not covered by another surface`);
}

export async function compactPage(page) {
  const body = await page.locator('[data-page-editor]').boundingBox();
  const viewport = page.viewportSize();
  assert.ok(body && body.y < viewport.height * .45, 'The page body begins within the first 45% of the viewport.');
  if (viewport.width === 390) {
    const actions = await page.locator('.topbar .tools button').evaluateAll(elements => elements
      .filter(element => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0)
      .map(element => element.getBoundingClientRect().toJSON()));
    assert.ok(actions.length >= 3);
    assert.equal(new Set(actions.map(box => Math.round(box.y))).size, 1, 'Mobile page actions occupy one row.');
    for (const box of actions) assert.ok(box.x >= 0 && box.x + box.width <= viewport.width && box.y >= 0 && box.y + box.height <= viewport.height);
  }
}

/** Observe real asynchronous status transitions without delaying or replacing requests. */
export async function watchSaveStates(page) {
  await page.evaluate(() => {
    window.slateSaveObserver?.disconnect();
    window.slateObservedSaveStates = [];
    window.slateSaveObserver = new MutationObserver(() => {
      for (const element of document.querySelectorAll('[role="status"]')) window.slateObservedSaveStates.push(element.textContent);
    });
    window.slateSaveObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
}

export async function savedAfterSaving(page) {
  await expect.poll(async () => (await page.getByRole('status').allTextContents()).filter(text => /^(Saving|Unsaved|Not saved|Offline)/.test(text)).length).toBe(0);
  await expect(page.getByRole('status').filter({ hasText: /^Saved/ }).first()).toBeVisible();
  const observed = await page.evaluate(() => window.slateObservedSaveStates);
  assert.ok(observed.some(text => /^Saving/.test(text)), 'Editing visibly passes through Saving before Saved.');
  assert.ok(observed.some(text => /^Saved/.test(text)), 'The committed save becomes Saved.');
}
