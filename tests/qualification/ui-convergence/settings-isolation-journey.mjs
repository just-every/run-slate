import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {expect} from '@playwright/test';
import {openNavigation} from './browser-support.mjs';
import {accessible} from './browser-evidence.mjs';

/** Native settings navigation and durable separation of workspace and space settings. */
export async function settingsIsolationJourney(state) {
  const {page, origin, api, atRest} = state;
  const width = page.viewportSize().width;
  const tabs = page.getByRole('navigation', {name: 'Settings sections'});
  const section = async name => {
    await tabs.getByRole('link', {name, exact: true}).click();
    await expect(tabs.getByRole('link', {name, exact: true})).toHaveAttribute('aria-current', 'page');
  };
  const enterSettings = async () => {
    await openNavigation(page);
    await page.getByRole('navigation', {name: 'Workspace navigation'}).getByRole('link', {name: 'Settings', exact: true}).click();
    await expect(tabs).toBeVisible();
  };
  // Enter through the app's own navigation, rather than a section URL.
  await page.getByRole('link', {name: 'Back to workspace', exact: true}).click();
  await enterSettings();
  // These scroll controls exist only in the phone layout. Keyboard input
  // establishes focus-visible, just as the retained authority journey does.
  if (width === 390) {
    await page.keyboard.press('Tab');
    for (const name of ['Previous settings sections', 'More settings sections']) {
      const control = page.getByRole('button', {name, exact: true});
      await expect(control).toHaveAttribute('data-tooltip', /\S+\s+\S+/);
      await control.focus();
      await expect.poll(() => control.evaluate(element => getComputedStyle(element, '::after').opacity)).toBe('1');
    }
    await accessible(page, 'phone settings navigation keyboard tooltip');
    await tabs.getByRole('link', {name: 'Workspace', exact: true}).focus();
  }
  const original = await api('/api/workspace');
  const space = (await api('/api/containers')).items.find(item => item.name === 'Handbook');
  assert.ok(space);

  await section('People');
  const members = (await api('/api/members')).items;
  assert.ok(members.length >= 2);
  for (const member of members) await expect(page.locator('.settings-list').first()).toContainText(member.displayName);
  await page.getByRole('button', {name: 'Create group', exact: true}).click();
  const group = page.getByRole('dialog', {name: 'Create group', exact: true});
  for (const member of members) await expect(group.getByRole('checkbox', {name: member.displayName, exact: true})).toBeVisible();
  await group.getByRole('button', {name: 'Cancel', exact: true}).click();
  const guests = page.getByRole('region', {name: 'Guest management'});
  await expect(guests.getByRole('button', {name: 'Invite a guest', exact: true})).toBeEnabled();
  await guests.getByRole('button', {name: 'Guest settings', exact: true}).click();
  const guestSettings = page.getByRole('dialog', {name: 'Guest settings', exact: true});
  await expect(guestSettings.getByLabel('Allowed email domains')).toBeVisible();
  await guestSettings.getByRole('button', {name: 'Cancel', exact: true}).click();
  await accessible(page, 'settings people groups and guests');

  await section('Statuses');
  await page.getByRole('button', {name: 'Add status', exact: true}).click();
  const newStatus = page.getByRole('dialog', {name: 'Add status', exact: true});
  await newStatus.getByLabel('Name', {exact: true}).fill('Settings review');
  const statusCommitted = page.waitForResponse(response => new URL(response.url()).pathname === '/api/status' && response.request().method() === 'POST');
  await newStatus.getByRole('button', {name: 'Save status', exact: true}).click();
  assert.equal((await statusCommitted).status(), 200);
  await expect(newStatus).toBeHidden();
  await page.reload({waitUntil: 'networkidle'});
  const statuses = (await api('/api/status')).items;
  assert.ok(statuses.some(status => status.label === 'Settings review'));
  assert.ok(statuses.length > 0, 'The vocabulary proof reads populated native statuses.');
  for (const status of statuses) await expect(page.locator('.settings-list')).toContainText(status.label);
  await page.locator('.settings-list li').first().getByRole('button', {name: 'Edit', exact: true}).click();
  const statusEditor = page.getByRole('dialog', {name: 'Edit status', exact: true});
  await expect(statusEditor.getByLabel('Name', {exact: true})).toHaveValue(statuses[0].label);
  await statusEditor.getByRole('button', {name: 'Cancel', exact: true}).click();
  await accessible(page, 'settings status vocabulary');

  await section('Import & export');
  await expect(page.getByLabel('File', {exact: true})).toBeEnabled();
  await expect(page.getByRole('combobox', {name: 'Format', exact: true})).toBeEnabled();
  await expect(page.getByRole('button', {name: 'Upload and review', exact: true})).toBeEnabled();
  await page.getByRole('button', {name: 'Export readable workspace', exact: true}).click();
  const exporter = page.getByRole('dialog', {name: 'Export readable content', exact: true});
  await expect(exporter.getByLabel('Content', {exact: true})).toHaveValue('workspace');
  await expect(exporter.getByRole('button', {name: 'Download export', exact: true})).toBeEnabled();
  await exporter.getByRole('button', {name: 'Cancel', exact: true}).click();
  await accessible(page, 'settings import and export');

  // Native read-back is accompanied by canonical stored rows, including immutable
  // revision contents. Park the document before the harness's persisted checkpoint.
  const snapshots = {};
  const snapshot = async name => {
    const workspace = await api('/api/workspace');
    const container = await api(`/api/containers/${space.id}`);
    await page.goto('about:blank');
    const tables = await atRest(`SELECT * FROM containers ORDER BY id;
      SELECT * FROM container_grants ORDER BY id;
      SELECT * FROM record_revisions WHERE entity_kind='container' ORDER BY id;
      SELECT * FROM core_entity_revisions WHERE entity_kind='workspace' ORDER BY id;`);
    const value = {workspace, container, containers: tables[0].results, grants: tables[1].results,
      containerRevisions: tables[2].results, workspaceRevisions: tables[3].results};
    assert.ok(value.grants.length > 0 && value.containerRevisions.length > 0);
    snapshots[name] = value;
    await page.goto(origin + '/app', {waitUntil: 'networkidle'});
    await enterSettings();
    return value;
  };
  const editWorkspace = async values => {
    await enterSettings();
    await section('Workspace');
    await page.getByRole('button', {name: 'Edit workspace & policies', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'Workspace settings', exact: true});
    for (const [name, value] of Object.entries(values)) {
      const control = dialog.locator(`[name="${name}"]`);
      if (await control.evaluate(element => element.tagName === 'SELECT')) await control.selectOption(value);
      else await control.fill(value);
    }
    const committed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/workspace' && response.request().method() === 'PUT');
    await dialog.getByRole('button', {name: 'Save settings', exact: true}).click();
    assert.equal((await committed).status(), 200);
    await expect(dialog).toBeHidden();
    await page.reload({waitUntil: 'networkidle'});
    await expect(page.getByTestId('workspace-name')).toHaveText(values.name);
    await page.getByRole('button', {name: 'Edit workspace & policies', exact: true}).click();
    for (const [name, value] of Object.entries(values)) await expect(dialog.locator(`[name="${name}"]`)).toHaveValue(value);
    await accessible(page, 'workspace identity and external access switches');
    await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
    const stored = await api('/api/workspace');
    for (const [name, value] of Object.entries(values)) assert.equal(stored[name], value);
  };
  const openSpace = async name => {
    await openNavigation(page);
    await page.getByRole('navigation', {name: 'Workspace navigation'}).getByRole('link', {name: 'Spaces', exact: true}).click();
    await expect(tabs).toHaveCount(0);
    await page.getByRole('button', {name: new RegExp(name)}).filter({has: page.locator('strong')}).click();
    await page.getByRole('navigation', {name: 'Space navigation'}).getByRole('button', {name: 'Settings', exact: true}).click();
    await expect(page.getByRole('heading', {name: 'Space settings', exact: true})).toBeVisible();
    await expect(page.getByRole('button', {name: 'Edit workspace & policies', exact: true})).toHaveCount(0);
  };
  const editSpace = async (name, values) => {
    await openSpace(name);
    await page.getByRole('button', {name: 'Edit details', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'Space details', exact: true});
    for (const [field, value] of Object.entries(values)) await dialog.locator(`[name="${field}"]`).fill(value ?? '');
    const committed = page.waitForResponse(response => new URL(response.url()).pathname === `/api/containers/${space.id}` && response.request().method() === 'PATCH');
    await dialog.getByRole('button', {name: 'Save settings', exact: true}).click();
    assert.equal((await committed).status(), 200);
    await expect(dialog).toBeHidden();
    await page.reload({waitUntil: 'networkidle'});
    await openSpace(values.name);
    const stored = await api(`/api/containers/${space.id}`);
    for (const [field, value] of Object.entries(values)) assert.equal(stored[field], value);
    await page.getByRole('button', {name: 'Edit details', exact: true}).click();
    for (const [field, value] of Object.entries(values)) await expect(dialog.locator(`[name="${field}"]`)).toHaveValue(value ?? '');
    await accessible(page, 'separate space settings after reload');
    await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  };

  await editSpace(space.name, {name: space.name, description: 'A space-specific baseline', icon: '📗', key: 'GUIDE'});
  const before = await snapshot('before');
  assert.deepEqual(before.workspace, original, 'Preparing native space history preserves workspace settings.');
  const identityFields = ['name', 'mark', 'description', 'guestAccess', 'publicLinkAccess', 'anonymousAccess'];
  const workspaceEdit = {name: 'Field operations', mark: 'FO', description: 'Workspace-wide publishing and guest policy',
    ...Object.fromEntries(identityFields.slice(3).map(name => [name, original[name] === 'allowed' ? 'forbidden' : 'allowed']))};
  await editWorkspace(workspaceEdit);
  const afterWorkspace = await snapshot('afterWorkspace');
  assert.ok(afterWorkspace.workspaceRevisions.length > 0);
  assert.notEqual(afterWorkspace.workspace.revisionId, before.workspace.revisionId);
  assert.deepEqual(afterWorkspace.workspace.policies, before.workspace.policies);
  for (const field of ['container', 'containers', 'grants', 'containerRevisions']) assert.deepEqual(afterWorkspace[field], before[field], `Workspace changes preserve stored ${field}.`);

  const details = {name: 'Handbook delivery', description: 'A space-specific delivery guide', icon: '📘', key: 'DELIVERY'};
  await editSpace(space.name, details);
  const afterSpace = await snapshot('afterSpace');
  assert.notEqual(afterSpace.container.revisionId, afterWorkspace.container.revisionId);
  assert.deepEqual(afterSpace.workspace, afterWorkspace.workspace, 'Space edits preserve every workspace setting and its current revision.');
  assert.deepEqual(afterSpace.workspaceRevisions, afterWorkspace.workspaceRevisions, 'Space edits add no workspace revision and rewrite no retained revision.');
  assert.deepEqual(afterSpace.grants, before.grants, 'Space details never rewrite existing grants.');
  for (const field of ['visibility', 'guestAccess', 'publicLinkAccess', 'anonymousAccess']) assert.equal(afterSpace.container[field], before.container[field]);
  for (const revision of before.containerRevisions) assert.deepEqual(afterSpace.containerRevisions.find(item => item.id === revision.id), revision);

  // Leave later guest and authority journeys on their original identity and switches.
  await editSpace(details.name, Object.fromEntries(['name', 'description', 'icon', 'key'].map(name => [name, space[name]])));
  await editWorkspace(Object.fromEntries(identityFields.map(name => [name, original[name]])));
  await mkdir('.artifacts/ui-convergence', {recursive: true});
  await writeFile(`.artifacts/ui-convergence/settings-isolation-${width}.json`, JSON.stringify(snapshots, null, 2));
}
