import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { accessible } from './browser-support.mjs';

/** Exercise a mounted expiry editor while the actual grant changes underneath it. */
export async function expiryRegrantJourney({ page, api }, pageId) {
  const grant = page.locator('.grant-list li').filter({ has: page.getByRole('combobox', { name: 'Access for Morgan Reader', exact: true }) });
  const expiry = grant.getByRole('textbox', { name: 'Access expiry date and time', exact: true });
  await expiry.fill('01 Jan 2020, 16:30');
  await expiry.blur();
  await expect.poll(async () => (await api(`/api/sharing/pages/${pageId}`)).items.find(item => item.principalId === 'browser-reader').status).toBe('expired');
  await expect(grant.getByRole('button', { name: 'Regrant access', exact: true })).toBeVisible();
  await accessible(page, 'expired local member grant');
  await grant.getByRole('button', { name: 'Regrant access', exact: true }).click();
  await expect.poll(async () => (await api(`/api/sharing/pages/${pageId}`)).items.find(item => item.principalId === 'browser-reader').expiresAt).toBe(null);
  await expect(expiry).toHaveValue('');
  await expect(grant.getByRole('button', { name: 'Regrant access', exact: true })).toHaveCount(0);
  assert.ok(await expiry.evaluate(input => input.validity.valid), 'Regrant clears any stale expiry validation.');
  await expiry.focus();
  await expiry.blur();
  await page.waitForTimeout(900);
  const regranted = (await api(`/api/sharing/pages/${pageId}`)).items.find(item => item.principalId === 'browser-reader');
  assert.equal(regranted.expiresAt, null, 'Blurring the mounted editor after regrant must not restore the expired date.');
  assert.equal(regranted.revokedAt, null);
  assert.notEqual(regranted.status, 'expired');
  await accessible(page, 'regranted local member has no stale expiry');
}
