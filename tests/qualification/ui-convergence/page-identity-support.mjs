import assert from 'node:assert/strict';
import {expect} from '@playwright/test';

/** Capture the loaded native dialog with its existing focus and hover tooltip. */
export async function identityDialogShot(page, dialog, capture, name) {
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole('button', {name: 'Close dialog', exact: true});
  await page.keyboard.press('Tab');
  await close.focus();
  await expect.poll(() => close.evaluate(element => getComputedStyle(element, '::after').opacity)).toBe('1');
  await capture(name + '-focus-tooltip');
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).focus();
  await page.mouse.move(0, 0);
  await expect.poll(() => close.evaluate(element => getComputedStyle(element, '::after').opacity)).toBe('0');
  await close.hover();
  await expect.poll(() => close.evaluate(element => getComputedStyle(element, '::after').opacity)).toBe('1');
  await capture(name);
}

/** Read the genuine commit before forwarding it to a control that may navigate. */
export async function identityCommit(page, pageId, routePath, action) {
  const captured = Promise.withResolvers();
  const matches = url => url.pathname === routePath;
  const intercept = async route => {
    if (route.request().method() !== 'POST') return route.continue();
    try {
      const input = route.request().postDataJSON();
      const response = await route.fetch({ maxRetries: 0 });
      assert.equal(response.status(), 200, await response.text());
      const result = await response.json();
      assert.equal(result.value.pageId, pageId);
      assert.equal(result.receipt.operationKey, input.operationKey);
      assert.equal(result.receipt.entity.kind, 'page');
      assert.equal(result.receipt.entity.id, pageId);
      assert.equal(result.receipt.revisionId, result.receipt.entity.revisionId);
      assert.ok(result.receipt.activityId);
      await route.fulfill({ response });
      captured.resolve({ route: routePath, input, ...result });
    } catch (cause) {
      captured.reject(cause);
      await route.abort().catch(() => {});
    }
  };
  await page.route(matches, intercept);
  try {
    const [commit] = await Promise.all([captured.promise, action()]);
    return commit;
  } finally {
    await page.unroute(matches, intercept);
  }
}
