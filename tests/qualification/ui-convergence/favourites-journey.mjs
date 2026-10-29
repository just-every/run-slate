import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { accessible, openNavigation, openPageAction } from './browser-support.mjs';
import { ok } from './two-people-support.mjs';

const identity = item => `${item.kind}:${item.id}`;
const keys = items => items.map(identity);
const sidebar = page => page.getByRole('navigation', { name: 'Favourites', exact: true });

async function readBack(person, origin, expected) {
  assert.deepEqual(keys((await ok(person.context, origin, 'GET', '/api/navigation')).favourites), expected);
  await person.page.reload({ waitUntil: 'networkidle' });
  await openNavigation(person.page);
  await expect.poll(() => sidebar(person.page).locator('.favourite-row > a').evaluateAll(links => links.map(link => link.getAttribute('href'))))
    .toEqual(expected.map(key => { const [kind, id] = key.split(':'); return `/app/${kind === 'container' ? 'containers' : 'pages'}/${id}`; }));
}

/** Native personal toggles, stable adjacent moves and removal on shared readable targets. */
export async function favouritesJourney(state, people) {
  const { alice, bob } = people, { origin } = state;
  const space = (await ok(alice.context, origin, 'POST', '/api/containers', {
    operationKey: randomUUID(), name: 'Release favourites', visibility: 'closed',
  })).value;
  await ok(alice.context, origin, 'POST', '/api/sharing', {
    operationKey: randomUUID(), targetKind: 'container', targetId: space.id,
    principalKind: 'member', principalId: bob.id, level: 'view',
  });
  const targets = [{ kind: 'container', id: space.id, title: 'Release favourites' }];
  for (const title of ['Release checklist', 'Release contacts', 'Release decisions']) {
    const page = (await ok(alice.context, origin, 'POST', '/api/pages', {
      operationKey: randomUUID(), containerId: space.id, title,
    })).value;
    targets.push({ kind: 'page', id: page.pageId, title });
  }
  // Both members can read every target: privacy cannot pass through an ACL denial.
  for (const person of [alice, bob]) for (const target of targets)
    await ok(person.context, origin, 'GET', `/api/${target.kind === 'container' ? 'containers' : 'pages'}/${target.id}`);
  const initialAlice = keys((await ok(alice.context, origin, 'GET', '/api/navigation')).favourites);
  const initialBob = (await ok(bob.context, origin, 'GET', '/api/navigation')).favourites;
  const route = target => `${origin}/app/${target.kind === 'container' ? 'containers' : 'pages'}/${target.id}`;
  const toggle = async (person, target, enabled) => {
    await person.page.goto(route(target), { waitUntil: 'networkidle' });
    const label = enabled ? 'Add to favourites' : 'Remove from favourites';
    const receipt = person.page.waitForResponse(response => response.request().method() === 'PUT'
      && new URL(response.url()).pathname === '/api/navigation/favourites');
    if (target.kind === 'page') await openPageAction(person.page, label);
    else await person.page.locator('.space-actions').getByRole('button', { name: label, exact: true }).click();
    assert.equal((await receipt).status(), 200);
    await expect.poll(async () => (await ok(person.context, origin, 'GET', '/api/navigation')).favourites.some(item => identity(item) === identity(target))).toBe(enabled);
  };
  // Exercise both directions of each native control before retaining the mixed list.
  for (const target of targets.slice(0, 2)) {
    await toggle(alice, target, true);
    await toggle(alice, target, false);
    await readBack(alice, origin, initialAlice);
    assert.deepEqual((await ok(bob.context, origin, 'GET', '/api/navigation')).favourites, initialBob);
  }
  for (const target of targets) await toggle(alice, target, true);
  const before = (await ok(alice.context, origin, 'GET', '/api/navigation')).favourites;
  assert.equal(before.length, initialAlice.length + targets.length);
  for (const target of targets) assert.ok(keys(before).includes(identity(target)));
  await readBack(alice, origin, keys(before));
  await bob.page.goto(origin + '/app', { waitUntil: 'networkidle' });
  await readBack(bob, origin, keys(initialBob));
  for (const target of targets) await expect(sidebar(bob.page).getByRole('link', { name: target.title, exact: true })).toHaveCount(0);

  // Give the other member their own nonempty order over the same targets.
  for (const target of targets.slice(0, 3)) await toggle(bob, target, true);
  const bobBefore = (await ok(bob.context, origin, 'GET', '/api/navigation')).favourites;
  const untouchedBob = async () => {
    assert.deepEqual((await ok(bob.context, origin, 'GET', '/api/navigation')).favourites, bobBefore);
    await readBack(bob, origin, keys(bobBefore));
  };
  await readBack(alice, origin, keys(before));
  // Move a middle row, leaving at least one row on either side of the pair.
  const moved = before[2], expected = [...before];
  [expected[1], expected[2]] = [expected[2], expected[1]];
  const move = sidebar(alice.page).getByRole('button', { name: `Move ${moved.title} up`, exact: true });
  await sidebar(alice.page).getByRole('link', { name: moved.title, exact: true }).focus();
  await alice.page.keyboard.press('Tab');
  await move.focus();
  await expect(move).toBeFocused();
  assert.equal(await move.evaluate(element => getComputedStyle(element, '::after').opacity), '1', 'Keyboard focus shows the move tooltip immediately.');
  const receipt = alice.page.waitForResponse(response => response.request().method() === 'PUT'
    && new URL(response.url()).pathname === '/api/navigation/favourites');
  await move.click();
  assert.equal((await receipt).status(), 200);
  await expect.poll(async () => keys((await ok(alice.context, origin, 'GET', '/api/navigation')).favourites)).toEqual(keys(expected));
  await readBack(alice, origin, keys(expected));
  await untouchedBob();
  await accessible(alice.page, 'ordered personal favourites');
  await people.shot('alice', 'ordered personal favourites');

  // A single sidebar action removes each target kind and retains all other rows.
  for (const target of [targets[0], targets[1]]) {
    const remove = sidebar(alice.page).getByRole('button', { name: `Unfavourite ${target.title}`, exact: true });
    await sidebar(alice.page).getByRole('link', { name: target.title, exact: true }).focus();
    await alice.page.keyboard.press('Tab');
    await remove.focus();
    await expect(remove).toBeFocused();
    assert.equal(await remove.evaluate(element => getComputedStyle(element, '::after').opacity), '1', 'Keyboard focus shows the removal tooltip immediately.');
    await remove.click();
    expected.splice(expected.findIndex(item => identity(item) === identity(target)), 1);
    await expect.poll(async () => keys((await ok(alice.context, origin, 'GET', '/api/navigation')).favourites)).toEqual(keys(expected));
    await readBack(alice, origin, keys(expected));
    await untouchedBob();
  }
  await accessible(alice.page, 'personal favourites after one-action removal');
  await people.shot('alice', 'personal favourites after removal');
}
