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

/**
 * Read each genuine commit before forwarding it to a control that may navigate.
 * The interception is installed once, while the page is idle, and stays for the journey: removing a
 * route while the page issues its follow-up read (the list or page GET that follows every commit)
 * can strand that read inside the browser, so the committed state never reaches the screen.
 */
export async function identityCommits(page, pageId) {
  let current = null;
  const intercept = async route => {
    const request = route.request();
    if (!current || request.method() !== 'POST' || new URL(request.url()).pathname !== current.routePath) return route.continue();
    const {routePath, captured} = current;
    try {
      const input = request.postDataJSON();
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
  await page.waitForLoadState('networkidle');
  await page.route(url => url.pathname.startsWith('/api/'), intercept);
  return async (routePath, action) => {
    const captured = Promise.withResolvers();
    current = { routePath, captured };
    try {
      const [commit] = await Promise.all([captured.promise, action()]);
      return commit;
    } finally {
      current = null;
    }
  };
}
