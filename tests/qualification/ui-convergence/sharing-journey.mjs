import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { accessible, closeDetails } from './browser-support.mjs';
import { expiryRegrantJourney } from './expiry-journey.mjs';

export async function shareJourney({ page, origin, api, readerCookie, switchIdentity }, pageId) {
  await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const panel = page.locator('.right');
  await expect(panel.getByRole('heading', { name: 'Share this page' })).toBeVisible();
  assert.ok(await panel.evaluate(element => element.contains(document.activeElement)), 'Share opens with keyboard focus inside its panel.');
  const invite = page.getByRole('combobox', { name: 'Invite someone', exact: true });
  await expect(invite).toBeVisible();
  const inviteBox = await invite.boundingBox();
  const disclosureBox = await panel.locator('.advanced-access').boundingBox();
  assert.ok(inviteBox && disclosureBox && inviteBox.y < disclosureBox.y, 'Invite controls precede inherited-access disclosure.');
  const copyBox = await panel.getByRole('button', { name: 'Copy page link', exact: true }).boundingBox();
  assert.ok(copyBox && copyBox.y < disclosureBox.y, 'Copy link precedes inherited-access disclosure.');
  assert.equal(await panel.locator('.advanced-access').getAttribute('open'), null, 'Inherited access is initially collapsed.');
  await expect(panel.getByRole('button', { name: 'Remove access', exact: true })).toHaveCount(0);
  await expect(panel).not.toContainText(/\bContainers?\b/);
  const dateInputs = await panel.locator('input[type="datetime-local"]').count();
  assert.equal(dateInputs, 0, 'Share uses the app date convention rather than native locale-dependent datetime fields.');
  await invite.selectOption('member:browser-reader');
  await page.getByRole('combobox', { name: 'Permission', exact: true }).selectOption('view');
  await panel.locator('form').first().locator('summary').filter({ hasText: 'Set an access expiry' }).click();
  await panel.locator('form').first().getByRole('textbox', { name: 'Access expiry date and time', exact: true }).fill('31 Dec 2099, 16:30');
  await panel.locator('form').first().getByRole('textbox', { name: 'Access expiry date and time', exact: true }).blur();
  const submittedExpiry = await panel.locator('form').first().locator('input[type="hidden"][name="expiresAt"]').inputValue();
  await expect(panel.locator('form').first()).toContainText('Day month year, 24-hour time');
  await accessible(page, 'share invite');
  await page.getByRole('button', { name: 'Share page', exact: true }).click();
  await panel.locator('.advanced-access summary').first().click();
  await expect(page.getByRole('combobox', { name: 'Access for Morgan Reader', exact: true })).toBeVisible();
  await expect(panel.locator('.grant-list')).toContainText('31 Dec 2099');
  const grants = await api(`/api/sharing/pages/${pageId}`);
  assert.ok(grants.items.some(grant => grant.principalId === 'browser-reader' && grant.level === 'view' && !grant.revokedAt));
  assert.equal(new Date(grants.items.find(grant => grant.principalId === 'browser-reader').expiresAt).getFullYear(), 2099);
  const storedExpiry = grants.items.find(grant => grant.principalId === 'browser-reader').expiresAt;
  const readerGrant = panel.locator('.grant-list > li').filter({
    has: page.getByRole('combobox', { name: 'Access for Morgan Reader', exact: true }),
  });
  await expect(readerGrant).toHaveCount(1);
  await readerGrant.locator('details summary').click();
  const displayedExpiry = await readerGrant.getByRole('textbox', { name: 'Access expiry date and time', exact: true }).inputValue();
  assert.equal(displayedExpiry, '31 Dec 2099, 16:30');
  assert.equal(submittedExpiry, storedExpiry, 'Displayed and submitted expiry agree with the real grant.');
  const readerDocument = await api(`/api/pages/${pageId}`, { headers: { cookie: readerCookie } });
  assert.equal(readerDocument.page.id, pageId);
  assert.equal(readerDocument.permissions.level, 'view');
  await page.getByRole('button', { name: 'Copy page link', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Link copied', exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `${origin}/app/pages/${pageId}`);
  await accessible(page, 'shared page link');
  await expiryRegrantJourney({ page, api }, pageId);
  await closeDetails(page);
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeFocused();
  await switchIdentity('reader');
  try {
    await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('member-name')).toHaveText('Morgan Reader');
    await expect(page.locator('.page-document')).toContainText('Keep this unsent detail.');
    await expect(page.locator('.page-document')).toContainText('Second block: record the next action.');
    await expect(page.getByRole('textbox', { name: 'Page title', exact: true })).toHaveAttribute('readonly', '');
    assert.equal(await page.locator('.page-document [contenteditable="true"]').count(), 0, 'The granted reader renders committed content without editable controls.');
    await accessible(page, 'granted reader page');
  } finally { await switchIdentity('owner'); }

  await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const ownerPanel = page.locator('.right');
  await ownerPanel.locator('.advanced-access > summary').click();
  const ownerGrant = ownerPanel.locator('.grant-list > li').filter({
    has: page.getByRole('combobox', { name: 'Access for Morgan Reader', exact: true }),
  });
  await expect(ownerGrant.getByRole('combobox', { name: 'Access for Morgan Reader', exact: true })).toBeVisible();
  await ownerGrant.locator('details summary').click();
  await ownerGrant.getByRole('button', { name: 'Remove access', exact: true }).click();
  await expect.poll(async () => (await api(`/api/sharing/pages/${pageId}`)).items.find(item => item.principalId === 'browser-reader').revokedAt).not.toBeNull();
  const activityLink = page.locator('a[href="/app/settings/activity"]');
  await expect(activityLink).toBeVisible();
  await activityLink.click();
  await page.waitForURL(url => url.pathname === '/app/settings/activity');
  await expect(page.getByRole('heading', { name: 'What changed.', exact: true })).toBeVisible();
  assert.ok((await api(`/api/sharing/pages/${pageId}`)).items.find(item => item.principalId === 'browser-reader').revokedAt, 'Opening Activity leaves the removed page grant revoked.');
}
