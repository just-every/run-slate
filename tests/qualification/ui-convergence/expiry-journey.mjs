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
  const expired = (await api(`/api/sharing/pages/${pageId}`)).items.find(item => item.principalId === 'browser-reader');
  await regrantExpiredJourney({ page, api }, pageId, expired);
}

/** Regrant the retained row, including an expiry that passed during a live edit. */
export async function regrantExpiredJourney({ page, api }, pageId, expired) {
  const grant = page.locator('.grant-list > li').filter({ has: page.getByRole('combobox', { name: 'Access for Morgan Reader', exact: true }) });
  const details = grant.locator('details');
  if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
  const expiry = grant.getByRole('textbox', { name: 'Access expiry date and time', exact: true });
  const retained = (await api(`/api/sharing/pages/${pageId}`)).items.filter(item => item.principalId === expired.principalId);
  assert.equal(retained.length, 1, 'Expiry retains exactly the original grant.');
  assert.equal(retained[0].id, expired.id);
  assert.equal(retained[0].expiresAt, expired.expiresAt);
  assert.equal(retained[0].level, expired.level);
  assert.equal(retained[0].status, 'expired');
  assert.equal(retained[0].revokedAt, null, 'Expiry does not revoke or delete the grant.');
  await expect(grant).toContainText('Expired');
  await expect(grant.getByRole('button', { name: 'Regrant access', exact: true })).toBeVisible();
  await accessible(page, 'expired local member grant');
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/sharing' && response.request().method() === 'POST');
  await grant.getByRole('button', { name: 'Regrant access', exact: true }).click();
  const response = await saved;
  assert.equal(response.status(), 200);
  const submitted = response.request().postDataJSON(), receipt = await response.json();
  assert.equal(submitted.id, expired.id, 'One action updates the expired row, rather than replacing it.');
  assert.equal(submitted.expiresAt, null);
  assert.equal(submitted.level, expired.level);
  assert.equal(receipt.value.id, expired.id);
  assert.equal(receipt.receipt.operationKey, submitted.operationKey);
  assert.ok(receipt.receipt.activityId, 'The native regrant has a committed activity receipt.');
  await expect.poll(async () => (await api(`/api/sharing/pages/${pageId}`)).items.find(item => item.id === expired.id).expiresAt).toBe(null);
  await expect(expiry).toHaveValue('');
  await expect(grant.getByRole('button', { name: 'Regrant access', exact: true })).toHaveCount(0);
  assert.ok(await expiry.evaluate(input => input.validity.valid), 'Regrant clears any stale expiry validation.');
  await expiry.focus();
  await expiry.blur();
  await page.waitForTimeout(900);
  const rows = (await api(`/api/sharing/pages/${pageId}`)).items.filter(item => item.principalId === expired.principalId);
  assert.equal(rows.length, 1);
  const regranted = rows[0];
  assert.equal(regranted.id, expired.id);
  assert.equal(regranted.level, expired.level);
  assert.equal(regranted.expiresAt, null, 'Blurring the mounted editor after regrant must not restore the expired date.');
  assert.equal(regranted.revokedAt, null);
  assert.notEqual(regranted.status, 'expired');
  await accessible(page, 'regranted local member has no stale expiry');
  return { regranted, receipt: receipt.receipt };
}
