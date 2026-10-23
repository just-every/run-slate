import { auditAccessJourney } from './audit-access-journey.mjs';
import { webhookAccessJourney } from './webhook-access-journey.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect, request } from '@playwright/test';
import { accessible } from './browser-evidence.mjs';
import { ok } from './two-people-support.mjs';

/** Token custody is exercised in the owner's and member's actual settings panel. */
export async function developerAccessJourney(state, people) {
  const { page, context, origin } = state;
  const width = page.viewportSize().width;
  const space = (await ok(context, origin, 'GET', '/api/containers')).items.find(c => c.name === 'Handbook');
  await ok(context, origin, 'POST', '/api/sharing', { operationKey: randomUUID(), targetKind: 'container', targetId: space.id, principalKind: 'member', principalId: 'browser-reader', level: 'edit' });
  const transport = await request.newContext();
  try {
    for (const [view, name] of [[page, 'Handbook automation'], [people.bob.page, 'Reader script']]) {
      await view.goto(`${origin}/app/settings?section=developer`, { waitUntil: 'networkidle' });
      const panel = view.getByRole('region', { name: 'Developer access', exact: true });
      await expect(panel.getByRole('heading', { name: 'Create a token', exact: true })).toBeVisible();
      await accessible(view, `developer-access-empty-${name}`);
      await panel.getByLabel('Token name', { exact: true }).fill(name);
      await panel.getByLabel('Access to Handbook', { exact: true }).selectOption('write');
      await panel.getByRole('button', { name: 'Create token', exact: true }).click();
      await expect(panel.getByRole('status')).toHaveText('Token created.');
      const secret = await panel.getByLabel('Token secret', { exact: true }).inputValue();
      assert.ok(secret.length > 0);
      await panel.getByRole('button', { name: 'Copy token', exact: true }).click();
      await expect(panel.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
      // Hide the live credential before capturing any evidence.
      await panel.getByRole('button', { name: 'I saved my token', exact: true }).click();
      await expect(panel.getByLabel('Token secret', { exact: true })).toHaveCount(0);
      const response = await transport.get(`${origin}/api/v1/pages?containerId=${space.id}`, { headers: { authorization: `Bearer ${secret}` } });
      assert.equal(response.status(), 200);
      await panel.getByRole('button', { name: 'Refresh token activity', exact: true }).click();
      await expect(panel.getByRole('article', { name: `Token ${name}`, exact: true })).not.toContainText('Last used: Never');
      await accessible(view, `developer-access-active-${name}`);
      if (view === people.bob.page) {
        assert.equal(await panel.getByRole('article').count(), 1, 'A member sees only their own token.');
        await page.reload({ waitUntil: 'networkidle' });
        const ownerPanel = page.getByRole('region', { name: 'Developer access', exact: true });
        await expect(ownerPanel.getByRole('article', { name: 'Token Reader script', exact: true })).toBeVisible();
        await ownerPanel.getByRole('button', { name: 'Revoke Reader script', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Revoke Reader script?', exact: true });
        await accessible(page, 'developer-access-revoke-confirmation');
        await dialog.getByRole('button', { name: 'Revoke token', exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await expect(ownerPanel.getByRole('article', { name: 'Token Reader script', exact: true })).toContainText('State: Revoked');
        const refused = await transport.get(`${origin}/api/v1/pages?containerId=${space.id}`, { headers: { authorization: `Bearer ${secret}` } });
        assert.equal(refused.status(), 401);
        assert.equal((await refused.json()).error.code, 'UNAUTHENTICATED');
        await accessible(page, 'developer-access-revoked');
      }
    }
    const entries = (await ok(context, origin, 'GET', '/api/activity?kind=api-token')).items;
    for (const action of ['api-token.grant', 'api-token.use', 'api-token.revoke']) assert.ok(entries.some(entry => entry.action === action));
    await page.goto(`${origin}/app/settings?section=activity`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'What changed.', exact: true })).toBeVisible();
    await expect(page.locator('.settings-panel')).toContainText('api token revoke');
    await page.screenshot({ path: `.artifacts/ui-convergence/developer-access-${width}-activity.png`, fullPage: true });
    await page.goto(`${origin}/app/settings?section=developer`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('region', { name: 'Developer access', exact: true })).toContainText('State: Revoked');
    await webhookAccessJourney(state);
    await auditAccessJourney(state);
  } finally { await transport.dispose(); }
}
