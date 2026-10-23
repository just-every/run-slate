import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { accessible, closeDetails, openNavigation, openPageAction } from './browser-support.mjs';

// Default-profile Features steps share the existing core-workspace launch.
export async function featureSettingsJourney(state) {
  const {page, origin, context, api} = state;
  const returnTo = page.url();
  await page.goto(origin + '/app/settings?section=workspace', {waitUntil: 'networkidle'});
  const panel = page.getByRole('region', {name: 'Features', exact: true});
  await expect(panel.getByRole('heading', {name: 'Features', exact: true})).toBeVisible();
  const switches = (await api('/api/workspace/features')).items;
  assert.ok(switches.every(item => !item.enabled && !item.effective));
  for (const item of switches) {
    const row = panel.getByRole('region', {name: item.label, exact: true});
    const control = row.getByRole('button', {name: `Turn on ${item.label}`, exact: true});
    if (item.available) await expect(control).toBeEnabled(); else await expect(control).toBeDisabled();
    for (const reason of item.prerequisites) await expect(row.getByText(reason, {exact: true})).toBeVisible();
  }
  await expect(panel.getByText('Safety acceptance pending for answers.', {exact: true})).toBeVisible();
  await expect(panel.getByText('Safety acceptance pending for connected items.', {exact: true})).toBeVisible();
  await accessible(page, 'Features default off and safety holds');
  const mcp = panel.getByRole('region', {name: 'MCP', exact: true});
  await mcp.getByRole('button', {name: 'Turn on MCP', exact: true}).click();
  const confirmation = page.getByRole('dialog', {name: 'Turn on MCP', exact: true});
  await expect(confirmation.getByRole('button', {name: 'Close dialog', exact: true})).toHaveAttribute('data-tooltip', 'Close dialog');
  await accessible(page, 'Features confirmation');
  await confirmation.getByRole('button', {name: 'Turn on', exact: true}).click();
  await expect(confirmation).toHaveCount(0);
  await expect(mcp.getByRole('button', {name: 'Turn off MCP', exact: true})).toBeEnabled();
  await expect(mcp.getByRole('link', {name: 'Available client tools', exact: true})).toBeVisible();
  const tools = await context.request.get(origin + '/api/agent/tools');
  assert.equal(tools.status(), 200);
  assert.ok((await tools.json()).tools.length > 0);
  await expect(mcp.getByText(/Alex Owner/)).toBeVisible();
  await accessible(page, 'Features MCP on with owner and time');
  await page.reload({waitUntil: 'networkidle'});
  await expect(mcp.getByRole('button', {name: 'Turn off MCP', exact: true})).toBeEnabled();
  await mcp.getByRole('button', {name: 'Turn off MCP', exact: true}).click();
  await page.getByRole('dialog', {name: 'Turn off MCP', exact: true}).getByRole('button', {name: 'Turn off', exact: true}).click();
  await expect(mcp.getByRole('button', {name: 'Turn on MCP', exact: true})).toBeEnabled();
  await expect(mcp.getByRole('link', {name: 'Available client tools', exact: true})).toHaveCount(0);
  const refused = await context.request.get(origin + '/api/agent/tools');
  assert.equal(refused.status(), 403);
  assert.equal((await refused.json()).code, 'FEATURE_DISABLED');
  const activity = await api('/api/activity?action=workspace.feature-switch');
  assert.equal(activity.items.length, 2);
  assert.ok(activity.items.every(item => item.actor.displayName === 'Alex Owner' && item.occurredAt));
  await accessible(page, 'Features MCP off keeps history');
  state.assertNoConsoleErrors();
  await page.goto(returnTo, {waitUntil: 'networkidle'});
}

export async function askDraftJourney(state) {
  const { page, origin, api, switchIdentity } = state;
  await openPageAction(page, 'Ask');
  const question = page.getByRole('textbox', { name: 'Your question', exact: true });
  const submit = page.getByRole('button', { name: 'Ask Slate', exact: true });
  await expect(question).toBeEditable();
  await expect(submit).toBeDisabled();
  await question.fill('Who owns the unsent follow-up?');
  await page.locator('.right').getByText('Owner setup instructions', { exact: true }).click();
  const setupLink = page.locator('.right').getByRole('link', { name: 'Open AI setup instructions', exact: true });
  await expect(setupLink).toBeVisible();
  await expect(setupLink).toHaveAttribute('href', 'https://github.com/just-every/run-slate/blob/main/OPERATIONS.md');
  await expect(page.getByRole('combobox', { name: 'How can Slate help?', exact: true })).toBeDisabled();
  await accessible(page, 'Ask unavailable owner instructions');
  await closeDetails(page);
  await openPageAction(page, 'Ask');
  await expect(question).toHaveValue('Who owns the unsent follow-up?');
  const firstAskUrl = page.url();
  await page.goto(origin + '/app', { waitUntil: 'networkidle' });
  await page.goBack({ waitUntil: 'networkidle' });
  await expect(page).toHaveURL(firstAskUrl);
  await expect(question).toHaveValue('Who owns the unsent follow-up?');
  await expect(submit).toBeDisabled();
  await accessible(page, 'Ask Today and Back retains open panel and draft');
  await closeDetails(page);
  await openNavigation(page);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Page', exact: true }).click();
  await page.waitForURL(url => url.pathname.startsWith('/app/pages/') && url.pathname !== new URL(firstAskUrl).pathname);
  const title = page.getByLabel('Page title', { exact: true });
  await expect(title).toBeFocused();
  await page.keyboard.type('A separate draft page');
  await title.press('Tab');
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Page body', exact: true })).toBeVisible();
  await openPageAction(page, 'Ask');
  await expect(question).toHaveValue('');
  await question.fill('A question only for the second page.');
  const secondAskUrl = page.url();
  await page.goto(firstAskUrl, { waitUntil: 'networkidle' });
  await expect(question).toHaveValue('Who owns the unsent follow-up?');
  await page.goto(secondAskUrl, { waitUntil: 'networkidle' });
  await expect(question).toHaveValue('A question only for the second page.');
  await expect(submit).toBeDisabled();
  await accessible(page, 'Ask separate page draft');
  await switchIdentity('reader');
  try {
    await page.goto(firstAskUrl, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('member-name')).toHaveText('Morgan Reader');
    await expect(question).toHaveValue('');
    await question.fill('A reader question kept separate from the owner.');
    await page.reload({ waitUntil: 'networkidle' });
    await expect(question).toHaveValue('A reader question kept separate from the owner.');
    await expect(submit).toBeDisabled();
    await accessible(page, 'Ask separate member draft');
  } finally { await switchIdentity('owner'); }
  await page.goto(firstAskUrl, { waitUntil: 'networkidle' });
  await expect(question).toHaveValue('Who owns the unsent follow-up?');
  await expect(submit).toBeDisabled();
  assert.equal((await api('/api/runs')).items.length, 0, 'No model run is admitted without a provider.');
}
