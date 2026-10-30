import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { accessible } from './browser-evidence.mjs';

/** CONT-002: purposes seed an ordinary, subsequently editable space. */
export async function containerCreationJourney(state, width) {
  const { page, origin, api } = state;
  const receipts = [];
  const openForm = async () => {
    await page.goto(origin + '/app/settings?section=spaces', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Create space', exact: true }).click();
    return page.getByRole('dialog', { name: 'Create a space', exact: true });
  };
  const fill = async (form, values) => {
    for (const name of ['Name', 'Description', 'Icon', 'Short key']) {
      await form.getByLabel(name, { exact: true }).fill(values[name]);
    }
  };
  const submit = async (form, route, method, action) => {
    const response = page.waitForResponse(response => response.request().method() === method && new URL(response.url()).pathname === route);
    await form.getByRole('button', { name: action, exact: true }).click();
    const committed = await response;
    const body = await committed.json();
    receipts.push({ route, method, input: committed.request().postDataJSON(), status: committed.status(), body });
    return { status: committed.status(), body };
  };
  const settings = async id => {
    await page.goto(`${origin}/app/containers/${id}`, { waitUntil: 'networkidle' });
    await page.getByRole('navigation', { name: 'Space navigation' }).getByRole('button', { name: 'Settings', exact: true }).click();
  };
  const readFields = container => Object.fromEntries(['icon', 'name', 'description', 'visibility', 'key'].map(name => [name, container[name]]));
  const configureCreation = async value => {
    // This existing workspace switch has no settings input. Change only the
    // configuration fixture, with the real Worker stopped; all attempts below
    // still use native forms, membership, authorization and durable writes.
    assert.ok(['allowed', 'forbidden'].includes(value));
    await page.goto('about:blank');
    await state.atRest(`UPDATE workspaces SET member_container_creation='${value}' WHERE id='browser-workspace'`);
  };
  const create = async (purpose, visibility, values, { proof = false, smoke = false } = {}) => {
    const form = await openForm();
    if (!smoke) {
      // Check the initially selected purpose as well as selecting each option.
      await expect(form.getByLabel('Purpose', { exact: true })).toHaveValue('private');
      await expect(form.getByLabel('Visibility', { exact: true })).toHaveValue('private');
    }
    await form.getByLabel('Purpose', { exact: true }).selectOption(purpose);
    if (!smoke) await expect(form.getByLabel('Visibility', { exact: true })).toHaveValue(purpose);
    await fill(form, values);
    await form.getByLabel('Visibility', { exact: true }).selectOption(visibility);
    if (proof) await accessible(page, 'container creation purpose and overridden visibility');
    const result = await submit(form, '/api/containers', 'POST', 'Create space');
    assert.equal(result.status, 200, JSON.stringify(result.body));
    await expect(form).toBeHidden();
    const id = result.body.value.id;
    const expected = { icon: values.Icon, name: values.Name, description: values.Description, visibility, key: values['Short key'] || null };
    // Read the canonical resource after a document reload, not the submitted
    // form or a client cache. Every purpose uses the same tree and settings.
    await settings(id);
    const stored = await api(`/api/containers/${id}`);
    assert.deepEqual(readFields(stored), expected);
    assert.equal(stored.permissions.canManage, true);
    assert.equal(stored.permissions.canCreatePages, true);
    const home = await api(`/api/containers/${id}/home`);
    assert.equal(home.pageId, result.body.value.homePageId);
    assert.equal((await api(`/api/pages/${home.pageId}`)).page.containerId, id);
    receipts.push({ id, purpose, canonical: readFields(stored), homePageId: home.pageId });
    return { id, expected };
  };
  const edit = async ({ id, expected }, proof = false, smoke = false) => {
    await page.getByRole('button', { name: 'Edit details', exact: true }).click();
    const details = page.getByRole('dialog', { name: 'Space details', exact: true });
    const fields = { Name: expected.name, Description: expected.description, Icon: expected.icon, 'Short key': expected.key || '' };
    if (!smoke) for (const [name, value] of Object.entries(fields)) await expect(details.getByLabel(name, { exact: true })).toHaveValue(value);
    const changed = { Name: `${expected.name} revised`, Description: 'Updated team handover notes', Icon: '📚', 'Short key': expected.key ? `${expected.key}-2` : 'TEAM-2' };
    await fill(details, changed);
    if (proof) await accessible(page, 'container creation ordinary identity settings after reload');
    assert.equal((await submit(details, `/api/containers/${id}`, 'PATCH', 'Save settings')).status, 200);
    await expect(details).toBeHidden();
    await page.getByRole('button', { name: 'Visibility & public access', exact: true }).click();
    const access = page.getByRole('dialog', { name: 'Space access', exact: true });
    if (!smoke) await expect(access.getByLabel('Visibility', { exact: true })).toHaveValue(expected.visibility);
    const visibility = expected.visibility === 'open' ? 'private' : 'open';
    await access.getByLabel('Visibility', { exact: true }).selectOption(visibility);
    if (proof) await accessible(page, 'container creation ordinary access settings after reload');
    assert.equal((await submit(access, '/api/sharing/container-settings', 'POST', 'Save settings')).status, 200);
    await expect(access).toBeHidden();
    await page.reload({ waitUntil: 'networkidle' });
    const stored = await api(`/api/containers/${id}`);
    assert.deepEqual(readFields(stored), { icon: changed.Icon, name: changed.Name, description: changed.Description, key: changed['Short key'], visibility });
    receipts.push({ id, edited: readFields(stored) });
  };

  await state.switchIdentity('owner');
  if (width === 390) {
    // Responsive proof shares the existing phone registration. Business cases
    // run at 1440; this visits the clause's own three native screens once.
    await edit(await create('open', 'closed', { Name: 'Phone team notes', Description: 'Team handover on a phone', Icon: '🧭', 'Short key': '' }, { proof: true, smoke: true }), true, true);
  } else {
    try {
      await configureCreation('forbidden');
      for (const [purpose, visibility, values] of [
        ['private', 'private', { Name: 'Project planning', Description: 'Private project handover', Icon: '🧭', 'Short key': 'PLAN' }],
        ['open', 'closed', { Name: 'Team knowledge', Description: 'Team reference with a narrower audience', Icon: '📖', 'Short key': '' }],
        ['closed', 'closed', { Name: 'Restricted operations', Description: 'Restricted operational handover', Icon: '🔧', 'Short key': 'OPS' }],
      ]) {
        await edit(await create(purpose, visibility, values, { proof: purpose === 'open' }), purpose === 'open');
      }
      await configureCreation('allowed');
      await state.switchIdentity('reader');
      assert.equal((await api('/api/members/current')).role, 'member');
      const member = await create('closed', 'private', { Name: 'Member working notes', Description: 'Created by an allowed full member', Icon: '📝', 'Short key': 'MEMBER' });
      await edit(member);
      await state.switchIdentity('owner');
      await configureCreation('forbidden');
      const snapshot = async () => ({
        containers: await api('/api/containers'),
        pages: await api('/api/pages'),
        activity: await api('/api/activity?action=containers.create&limit=100'),
      });
      const before = await snapshot();
      const counts = await state.records();
      await state.switchIdentity('reader');
      const form = await openForm();
      const refused = { Name: 'Refused member space', Description: 'Must never be persisted', Icon: '🚫', 'Short key': 'DENIED' };
      await fill(form, refused);
      await form.getByLabel('Purpose', { exact: true }).selectOption('open');
      const result = await submit(form, '/api/containers', 'POST', 'Create space');
      assert.equal(result.status, 403);
      assert.equal(result.body.code, 'FORBIDDEN');
      await expect(form.getByRole('alert')).toContainText('limited to workspace owners');
      for (const [name, value] of Object.entries(refused)) await expect(form.getByLabel(name, { exact: true })).toHaveValue(value);
      await expect(form.getByLabel('Visibility', { exact: true })).toHaveValue('open');
      await form.getByRole('button', { name: 'Cancel', exact: true }).click();
      await state.switchIdentity('owner');
      assert.deepEqual(await snapshot(), before, 'A refused creation changes no containers, pages or creation activity.');
      assert.deepEqual(await state.records(), counts, 'No partial space or home page survives refusal and Worker reload.');
      receipts.push({ refused: result, unchangedCounts: counts });
    } finally {
      await state.switchIdentity('owner');
      await configureCreation('allowed');
    }
  }
  await writeFile(`.artifacts/ui-convergence/container-creation-${width}.json`, JSON.stringify(receipts, null, 2));
}
