import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { openNavigation } from './browser-support.mjs';
import { accessible } from './browser-evidence.mjs';
import { grant, ok, restrictedPage } from './two-people-support.mjs';

export async function treeFilterJourney(state) {
  const { page, context, origin, api, switchIdentity } = state;
  const space = (await api('/api/containers')).items.find(item => item.name === 'Handbook');
  const create = async (title, parentPageId) => (await ok(context, origin, 'POST', '/api/pages', { operationKey: randomUUID(), containerId: space.id, title, parentPageId })).value.pageId;
  const root = await create('Engineering handbook');
  const incident = await create('Incident response', root);
  const rota = await create('Escalation rota', incident);
  const onboarding = await create('Developer onboarding');
  await create('First week checklist', onboarding);
  await create('Release checklist');
  await ok(context, origin, 'POST', `/api/pages/${root}/expansion`, { operationKey: randomUUID(), expanded: false });
  await ok(context, origin, 'POST', `/api/pages/${onboarding}/expansion`, { operationKey: randomUUID(), expanded: true });
  const hidden = await restrictedPage(state, 'Confidential rota planning', []);
  const shared = await create('Shared rota contacts', hidden.pageId);
  await grant(context, origin, shared, 'browser-reader', 'view');
  const other = (await ok(context, origin, 'POST', '/api/containers', { operationKey: randomUUID(), name: 'People operations' })).value.id;
  // Carry this native workspace-readable fixture into the later index proof.
  state.containerIndexFixtures = [{ id: other, name: 'People operations', description: '', visibility: 'default', memberCount: 1, members: ['browser-owner'] }];
  await ok(context, origin, 'POST', '/api/pages', { operationKey: randomUUID(), containerId: other, title: 'Benefits guide' });
  await page.goto(origin + '/app', { waitUntil: 'networkidle' });
  await openNavigation(page);
  const pages = page.getByRole('navigation', { name: 'Pages', exact: true });
  const handbook = pages.locator('.space-group').filter({ has: page.getByRole('textbox', { name: 'Filter pages in Handbook', exact: true }) });
  const filter = handbook.getByRole('textbox', { name: 'Filter pages in Handbook', exact: true });
  const link = title => handbook.getByRole('link', { name: title, exact: true });
  await expect(link('First week checklist')).toBeVisible();
  await expect(link('Escalation rota')).toHaveCount(0);
  // Measure the DOM change from the input event, without Playwright polling latency.
  await filter.evaluate(input => {
    input.addEventListener('input', () => {
      const started = performance.now();
      const observer = new MutationObserver(() => {
        const group = input.closest('.space-group');
        if ([...group.querySelectorAll('.page-tree a')].some(a => a.textContent === 'Escalation rota')) {
          window.slateTreeFilterMs = performance.now() - started;
          observer.disconnect();
        }
      });
      observer.observe(input.closest('.space-group'), { subtree: true, childList: true, characterData: true });
    }, { once: true });
  });
  await filter.fill('ESCALATION ROTA');
  await expect(link('Escalation rota')).toBeVisible();
  assert.ok(await page.evaluate(() => window.slateTreeFilterMs < 200), 'Title filtering renders within 200ms.');
  await expect(link('Engineering handbook')).toBeVisible();
  await expect(link('Incident response')).toBeVisible();
  await expect(link('Developer onboarding')).toHaveCount(0);
  await expect(pages.getByRole('link', { name: 'Benefits guide', exact: true })).toBeVisible();
  assert.deepEqual(await api(`/api/pages/${root}/expansion`), { expanded: false });
  assert.deepEqual(await api(`/api/pages/${onboarding}/expansion`), { expanded: true });
  await accessible(page, 'tree filter retains matched ancestors');
  await handbook.getByRole('button', { name: 'Clear page filter in Handbook', exact: true }).click();
  await expect(filter).toBeFocused();
  await expect(link('First week checklist')).toBeVisible();
  await expect(link('Escalation rota')).toHaveCount(0);
  await expect(handbook.getByRole('button', { name: 'Expand Engineering handbook', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await accessible(page, 'cleared tree restores expansion');
  await filter.fill('No matching handbook title');
  await expect(handbook.getByRole('status')).toHaveText('No page titles match.');
  await filter.press('Escape');
  await expect(filter).toHaveValue('');
  await expect(link('First week checklist')).toBeVisible();
  await page.reload({ waitUntil: 'networkidle' });
  await openNavigation(page);
  await expect(link('First week checklist')).toBeVisible();
  await expect(link('Escalation rota')).toHaveCount(0);
  await switchIdentity('reader');
  await page.goto(origin + '/app', { waitUntil: 'networkidle' });
  await openNavigation(page);
  const sharedSection = pages.getByRole('region', { name: 'Shared with me', exact: true });
  const sharedLink = title => sharedSection.getByRole('link', { name: title, exact: true });
  await sharedSection.getByRole('textbox', { name: 'Filter pages in Shared with me · Handbook', exact: true }).fill('rota');
  await expect(sharedLink('Shared rota contacts')).toBeVisible();
  await expect(pages.getByRole('link', { name: 'Confidential rota planning', exact: true })).toHaveCount(0);
  await accessible(page, 'tree filter reveals no unreadable ancestor');
  await sharedLink('Shared rota contacts').click();
  await expect(page.getByRole('textbox', { name: 'Page title', exact: true })).toHaveValue('Shared rota contacts');
  if (page.viewportSize().width === 390) await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeVisible();
}
