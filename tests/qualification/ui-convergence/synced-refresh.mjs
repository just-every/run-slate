import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {tap} from './touch-controls.mjs';

/** Measure the actual Save event to the other copy's render, including the write. */
export async function saveAndMeasureSyncedCopy(page, otherPage, changed) {
  const save = page.getByRole('button', {name: 'Save synced block', exact: true});
  const copy = otherPage.locator('[aria-label="Synced copy"]');
  await expect(copy).toBeVisible();
  await copy.evaluate((element, text) => {
    const observation = {shownAt: undefined, observer: new MutationObserver(() => {
      if (element.textContent.includes(text)) {
        observation.shownAt = Date.now();
        observation.observer.disconnect();
      }
    })};
    window.slateSyncedCopyRender = observation;
    observation.observer.observe(element, {subtree: true, childList: true, characterData: true});
  }, changed);
  await save.evaluate(button => {
    window.slateSyncedSaveAt = undefined;
    button.addEventListener('click', () => { window.slateSyncedSaveAt = Date.now(); }, {once: true, capture: true});
  });
  try {
    await tap(save);
    await expect(copy).toContainText(changed, {timeout: 5000});
    const [started, shown] = await Promise.all([
      page.evaluate(() => window.slateSyncedSaveAt),
      otherPage.evaluate(() => window.slateSyncedCopyRender.shownAt),
    ]);
    // Touch preparation precedes the edit; Playwright may observe the text on a
    // later polling turn. Neither belongs in the product's refresh duration.
    assert.ok(Number.isFinite(started) && Number.isFinite(shown), 'The save and visible copy render were observed.');
    assert.ok(shown >= started && shown - started <= 5000, `The visible copy refreshes within five seconds (${shown - started} ms).`);
    console.log(`BLOCK-011 visible copy rendered ${shown - started} ms after Save.`);
  } finally {
    await otherPage.evaluate(() => { window.slateSyncedCopyRender.observer.disconnect(); delete window.slateSyncedCopyRender; });
  }
}
