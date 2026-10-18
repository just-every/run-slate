import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { accessible } from './browser-evidence.mjs';

/** A genuine validation refusal from the emitted Worker, with no replaced response. */
export async function failedSaveJourney({ page, origin, api }) {
  const welcome = (await api('/api/pages')).items.find(item => item.title === 'Welcome');
  await page.goto(`${origin}/app/pages/${welcome.id}`, { waitUntil: 'networkidle' });
  const title = page.getByRole('textbox', { name: 'Page title', exact: true });
  const unsent = 'Escalation procedure: '.repeat(60);
  const refused = page.waitForResponse(response => response.request().method() === 'PATCH' && new URL(response.url()).pathname === `/api/pages/${welcome.id}` && response.status() === 400);
  await title.fill(unsent);
  await title.press('Tab');
  await refused;
  const failed = page.getByRole('status').filter({ hasText: /^Not saved/ });
  await expect(failed).toBeVisible();
  await expect(failed).toContainText('The submitted values are invalid');
  await expect(page.getByRole('status').filter({ hasText: /^Saved/ })).toHaveCount(0);
  await expect(title).toHaveValue(unsent);
  assert.equal((await api(`/api/pages/${welcome.id}`)).page.title, 'Welcome');
  await accessible(page, 'rejected title retains unsent value');
  const retry = page.getByRole('button', { name: 'Try saving again', exact: true });
  const refusedAgain = page.waitForResponse(response => response.request().method() === 'PATCH' && new URL(response.url()).pathname === `/api/pages/${welcome.id}` && response.status() === 400);
  await retry.click();
  await refusedAgain;
  await expect(failed).toBeVisible();
  await expect(title).toHaveValue(unsent);
  const corrected = 'Escalation procedure and on-call responsibilities';
  await title.fill(corrected);
  await title.press('Tab');
  await page.waitForTimeout(900);
  await expect(failed).toBeVisible();
  assert.equal((await api(`/api/pages/${welcome.id}`)).page.title, 'Welcome', 'Correcting a refused draft still waits for explicit retry.');
  await retry.click();
  await expect(failed).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible();
  assert.equal((await api(`/api/pages/${welcome.id}`)).page.title, corrected);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(title).toHaveValue(corrected);
  await accessible(page, 'explicit retry commits corrected title');
}
