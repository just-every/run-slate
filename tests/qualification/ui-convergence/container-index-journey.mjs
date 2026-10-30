import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { inbox, newOutboxLink } from '../../e2e/outbox-auth.mjs';
import { accessible } from './browser-support.mjs';
import { call, ok } from './two-people-support.mjs';

const labels = { default: 'Workspace access', open: 'Open to the team', closed: 'Members only', private: 'Private', personal: 'Personal' };
const ordered = rows => [...rows].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : a.id.localeCompare(b.id));
const metadata = ({ id, name, description, visibility, memberCount }) => ({ id, name, description, visibility, memberCount });
const rowText = row => `${labels[row.visibility]} · ${row.memberCount} ${row.memberCount === 1 ? 'member' : 'members'}${row.description ? ` · ${row.description}` : ''}`;

/** Native container creation, invitations, membership relations and grants; no application responses are replaced. */
export async function containerIndexJourney(state, width, inherited = []) {
  const { page, context, origin } = state;
  const evidence = `.artifacts/ui-convergence/container-index/${width}`;
  await mkdir(evidence, { recursive: true });
  const contexts = [], proof = { width, sessions: [], refusals: [] };
  const owner = { page, context, id: 'browser-owner', name: 'owner' };
  const invite = async (name, kind = 'member', containerId) => {
    const before = await inbox(origin);
    await ok(context, origin, 'POST', '/api/invitations', { operationKey: randomUUID(), email: `${name}@test.invalid`, kind, ...(containerId ? { containerId, level: 'view' } : {}) });
    const next = await context.browser().newContext({ viewport: page.viewportSize(), locale: 'en-US' });
    contexts.push(next);
    const view = await next.newPage();
    await view.goto(await newOutboxLink(origin, before), { waitUntil: 'domcontentloaded' });
    await view.getByRole('button', { name: 'Accept invitation', exact: true }).click();
    const session = await ok(next, origin, 'GET', '/api/session');
    return { page: view, context: next, id: session.member.id, name };
  };
  const create = async (person, name, visibility, description) => {
    const { value } = await ok(person.context, origin, 'POST', '/api/containers', { operationKey: randomUUID(), name, visibility, description });
    return { id: value.id, name, visibility, description, memberCount: 1, members: [person.id] };
  };
  const grant = (space, principalKind, principalId) => ok(context, origin, 'POST', '/api/sharing', { operationKey: randomUUID(), targetKind: 'container', targetId: space.id, principalKind, principalId, level: 'view' });
  const readIndex = async person => ordered((await ok(person.context, origin, 'GET', '/api/containers')).items.map(metadata));
  const panelFor = person => person.page.locator('.spaces-workspace');
  const rowsFor = person => panelFor(person).locator(':scope > .settings-list > li');
  const assertRows = async (person, expected) => {
    await expect(rowsFor(person).locator('strong')).toHaveText(expected.map(row => row.name));
    await expect(rowsFor(person).locator('p')).toHaveText(expected.map(rowText));
    assert.equal(await rowsFor(person).count(), expected.length, 'Unreadable spaces contribute no rows or index count.');
    return rowsFor(person).allTextContents();
  };
  const personal = async person => {
    // The native member door creates the one protected personal space when needed.
    await ok(person.context, origin, 'GET', '/api/members/current');
    const spaces = (await ok(person.context, origin, 'GET', '/api/containers')).items.filter(row => row.visibility === 'personal');
    assert.equal(spaces.length, 1);
    return { id: spaces[0].id, name: 'Personal', description: '', visibility: 'personal', memberCount: 1, members: [person.id] };
  };
  try {
    const alice = await invite('synthetic-slate-301');
    const bob = await invite('synthetic-slate-302');
    const handbook = (await ok(context, origin, 'GET', '/api/containers')).items.find(row => row.name === 'Handbook');
    assert.ok(handbook);
    const initial = { id: handbook.id, name: 'Handbook', description: '', visibility: 'default', memberCount: 1, members: [owner.id] };
    const shared = await create(owner, 'Shared handbook', 'default', 'Current team procedures');
    const open = await create(owner, 'Open handbook', 'open', 'Knowledge for everyone');
    const closed = await create(owner, 'Review council', 'closed', 'Reviewed decisions');
    const privateSpace = await create(owner, 'Payroll notes', 'private', 'Restricted finance notes');
    const sealed = await create(owner, 'Sealed decisions', 'private', 'Not readable through membership alone');
    const response = await create(alice, 'Response operations', 'private', 'Member-owned incident notes');
    await grant(closed, 'member', alice.id);
    const group = (await ok(context, origin, 'POST', '/api/groups', { operationKey: randomUUID(), name: 'Index reviewers', memberIds: [bob.id] })).value;
    await grant(closed, 'group', group.id);
    await grant(privateSpace, 'member', bob.id);
    // There is no join mutation today. These are native membership relations,
    // independent of the real grants above; all containers came through POST.
    await Promise.all([page, alice.page, bob.page].map(view => view.goto('about:blank')));
    await state.atRest(`INSERT INTO container_members(container_id,member_id,created_at) VALUES('${closed.id}','${alice.id}',datetime('now')),('${sealed.id}','${alice.id}',datetime('now'));`);
    closed.memberCount = sealed.memberCount = 2;
    closed.members.push(alice.id);
    sealed.members.push(alice.id);
    const own = new Map();
    for (const person of [owner, alice, bob]) own.set(person.id, await personal(person));

    // Navigation is already mounted before this creation. My memberships must
    // include the committed space immediately, without a navigation reload.
    await alice.page.goto(origin + '/app/containers', { waitUntil: 'networkidle' });
    await panelFor(alice).getByRole('checkbox', { name: 'My memberships', exact: true }).check();
    await panelFor(alice).getByRole('button', { name: 'Create space', exact: true }).click();
    const dialog = alice.page.getByRole('dialog', { name: 'Create a space', exact: true });
    await dialog.getByLabel('Name', { exact: true }).fill('Incident follow-up');
    await dialog.getByLabel('Description', { exact: true }).fill('Follow-up owned by the creator');
    await dialog.locator('select[name="visibility"]').selectOption('closed');
    const created = alice.page.waitForResponse(result => new URL(result.url()).pathname === '/api/containers' && result.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Create space', exact: true }).click();
    const result = await created;
    assert.equal(result.status(), 200);
    const late = { id: (await result.json()).value.id, name: 'Incident follow-up', description: 'Follow-up owned by the creator', visibility: 'closed', memberCount: 1, members: [alice.id] };
    await expect(dialog).toHaveCount(0);
    await expect(rowsFor(alice).locator('strong').filter({ hasText: late.name })).toHaveText(late.name);

    const visible = new Map([
      [owner.id, [initial, ...inherited, shared, open, closed, privateSpace, sealed, response, late, own.get(owner.id)]],
      [alice.id, [...inherited, shared, open, closed, response, late, own.get(alice.id)]],
      [bob.id, [...inherited, shared, open, closed, privateSpace, own.get(bob.id)]],
    ]);
    const all = [initial, ...inherited, shared, open, closed, privateSpace, sealed, response, late, ...own.values()];
    // Full semantics are asserted once on desktop. The existing phone caller
    // retains a populated index and membership smoke, plus both changed screens.
    for (const person of width === 1440 ? [owner, alice, bob] : [alice]) {
      const expected = ordered(visible.get(person.id).map(metadata));
      const memberships = new Set(visible.get(person.id).filter(row => row.members.includes(person.id)).map(row => row.id));
      const actual = await readIndex(person);
      assert.deepEqual(actual, expected, `${person.name}: exact current API list, metadata, counts and explicit memberships`);
      await person.page.goto(origin + '/app/settings?section=spaces', { waitUntil: 'networkidle' });
      const shown = await assertRows(person, expected);
      await accessible(person.page, 'container index');
      await person.page.screenshot({ path: `${evidence}/${person.name}-index.png`, fullPage: true });
      const filters = [];
      const apply = async (visibility, membership, personalOnly) => {
        await panelFor(person).locator(':scope > .action-row select').selectOption(visibility);
        await panelFor(person).getByRole('checkbox', { name: 'My memberships', exact: true }).setChecked(membership);
        await panelFor(person).getByRole('checkbox', { name: 'Personal spaces', exact: true }).setChecked(personalOnly);
        const matched = expected.filter(row => (!visibility || row.visibility === visibility) && (!membership || memberships.has(row.id)) && (!personalOnly || row.visibility === 'personal'));
        const ui = await assertRows(person, matched);
        filters.push({ visibility, membership, personal: personalOnly, expected: matched, ui });
      };
      if (width === 1440) {
        for (const visibility of ['', ...Object.keys(labels)]) {
          for (const [membership, personalOnly] of [[false, false], [true, false], [false, true], [true, true]]) await apply(visibility, membership, personalOnly);
        }
      } else {
        await apply('', true, false);
        await apply('personal', true, true);
      }
      await apply('', false, false);
      await person.page.reload({ waitUntil: 'networkidle' });
      await assertRows(person, expected);
      assert.deepEqual(await readIndex(person), expected, 'Reload preserves the exact authorized list.');
      for (const row of width === 1440 ? expected : expected.filter(item => item.id === response.id)) {
        await rowsFor(person).locator('.space-choice').filter({ has: person.page.locator('strong', { hasText: new RegExp(`^\\s*${row.name}\\s*$`) }) }).click();
        await expect(person.page.locator('.space-detail > h3')).toHaveText(row.name);
        assert.deepEqual(metadata(await ok(person.context, origin, 'GET', `/api/containers/${row.id}`)), row);
        await expect(person.page.getByRole('region', { name: 'Space home', exact: true })).toBeVisible();
      }
      await person.page.screenshot({ path: `${evidence}/${person.name}-opened.png`, fullPage: true });
      proof.sessions.push({ person: person.name, memberships: [...memberships], expected, api: actual, ui: shown, filters, reloaded: true, opened: width === 1440 ? expected.map(row => row.id) : [response.id] });
      if (width === 1440) for (const denied of all.filter(row => !expected.some(item => item.id === row.id))) {
        const refused = await call(person.context, origin, 'GET', `/api/containers/${denied.id}`);
        assert.equal(refused.status, 404, `${person.name} cannot directly read ${denied.name}`);
        assert.ok(!JSON.stringify(refused.body).includes(denied.id));
        assert.ok(!JSON.stringify(refused.body).includes(denied.description || denied.name));
        proof.refusals.push({ person: person.name, id: denied.id, status: refused.status });
      }
    }
    if (width === 1440) {
      const guest = await invite('synthetic-slate-303', 'guest', shared.id);
      assert.equal((await call(guest.context, origin, 'GET', '/api/containers')).status, 403, 'A readable container never gives a guest index authority.');
      assert.equal((await call(guest.context, origin, 'GET', `/api/containers/${shared.id}`)).status, 200);
      assert.equal((await call(guest.context, origin, 'GET', `/api/containers/${own.get(owner.id).id}`)).status, 404);
      proof.refusals.push({ person: 'guest', index: 403, shared: 200, personal: 404 });
      await ok(context, origin, 'POST', '/api/guests/revoke', { operationKey: randomUUID(), memberIds: [guest.id] });
    }
  } finally {
    await writeFile(`${evidence}/proof.json`, JSON.stringify(proof, null, 2) + '\n');
    for (const next of contexts) await next.close();
  }
}
