import assert from 'node:assert/strict';
import { request, expect } from '@playwright/test';
import { accessible } from './browser-evidence.mjs';
export async function scimAccessJourney(state) {
  const { page, origin } = state, transport = await request.newContext();
  const panel = page.getByRole('region', { name: 'Directory provisioning', exact: true });
  try {
    await expect(panel.getByRole('heading', { name: 'Directory provisioning', exact: true })).toBeVisible();
    await panel.getByLabel('Directory credential name', { exact: true }).fill('Workspace directory');
    await panel.getByRole('button', { name: 'Create directory credential', exact: true }).click();
    await expect(panel.getByRole('status')).toHaveText('Directory credential created.');
    const previous = await panel.getByLabel('Directory secret', { exact: true }).inputValue();
    await panel.getByRole('button', { name: 'Copy directory secret', exact: true }).click();
    await expect(panel.getByRole('status')).toHaveText('Directory secret copied.');
    await panel.getByRole('button', { name: 'I saved the directory secret', exact: true }).click();
    assert.equal((await transport.get(`${origin}/scim/v2/Users`, { headers: { authorization: `Bearer ${previous}` } })).status(), 200);
    await panel.getByRole('button', { name: 'Refresh directory activity', exact: true }).click();
    await expect(panel.getByRole('article', { name: 'Directory credential Workspace directory', exact: true })).not.toContainText('Last used: Never');
    await accessible(page, 'scim-access-created');
    await panel.getByRole('button', { name: 'Rotate Workspace directory', exact: true }).click();
    const rotate = page.getByRole('dialog', { name: 'Rotate Workspace directory?', exact: true });
    await accessible(page, 'scim-access-rotate-confirmation');
    await rotate.getByRole('button', { name: 'Rotate directory credential', exact: true }).click();
    await expect(rotate).toHaveCount(0);
    const secret = await panel.getByLabel('Directory secret', { exact: true }).inputValue();
    assert.equal((await transport.get(`${origin}/scim/v2/Users`, { headers: { authorization: `Bearer ${previous}` } })).status(), 401);
    assert.equal((await transport.get(`${origin}/scim/v2/Users`, { headers: { authorization: `Bearer ${secret}` } })).status(), 200);
    await panel.getByRole('button', { name: 'I saved the directory secret', exact: true }).click();
    await accessible(page, 'scim-access-rotated');
    await panel.getByRole('button', { name: 'Revoke directory Workspace directory', exact: true }).click();
    const revoke = page.getByRole('dialog', { name: 'Revoke Workspace directory?', exact: true });
    await accessible(page, 'scim-access-revoke-confirmation');
    await revoke.getByRole('button', { name: 'Revoke directory credential', exact: true }).click();
    await expect(revoke).toHaveCount(0);
    await expect(panel.getByRole('article', { name: 'Directory credential Workspace directory', exact: true })).toContainText('State: Revoked');
    assert.equal((await transport.get(`${origin}/scim/v2/Users`, { headers: { authorization: `Bearer ${secret}` } })).status(), 401);
    await accessible(page, 'scim-access-revoked');
  } finally { await transport.dispose(); }
}
