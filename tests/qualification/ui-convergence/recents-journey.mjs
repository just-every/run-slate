import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import { accessible } from './browser-evidence.mjs';
import { ok } from './two-people-support.mjs';

/** Native page visits, aged only after issuance, with independent readable histories. */
export async function recentsJourney(state, people) {
  const { alice, bob } = people, { origin } = state;
  const westCoast = ['America', 'Los_Angeles'].join('/'), tokyo = ['Asia', 'Tokyo'].join('/');
  const members = [['alice', alice, 'browser-owner', westCoast], ['bob', bob, bob.id, tokyo]];
  const baseline = {}, preferences = {}, issued = [];
  for (const [name, person, , timezone] of members) {
    const navigation = await ok(person.context, origin, 'GET', '/api/navigation');
    baseline[name] = navigation.recents.map(({ id, title }) => ({ id, title })).sort((a, b) => a.id < b.id ? 1 : -1);
    preferences[name] = navigation.preferences.value;
    await ok(person.context, origin, 'PUT', '/api/navigation/preferences', {
      operationKey: randomUUID(), expectedRevisionId: navigation.preferences.revisionId,
      value: { ...navigation.preferences.value, timezone },
    });
    await person.page.clock.setFixedTime(new Date('2024-03-01T12:00:00.000Z'));
  }
  const containerId = (await ok(alice.context, origin, 'POST', '/api/containers', {
    operationKey: randomUUID(), name: 'Recent team notes', visibility: 'private',
  })).value.id;
  await ok(alice.context, origin, 'POST', '/api/sharing', {
    operationKey: randomUUID(), targetKind: 'container', targetId: containerId,
    principalKind: 'member', principalId: bob.id, level: 'view',
  });
  const pages = [];
  for (const title of ['Arrival notes', 'Release checklist', 'Support handover', 'Team decisions', 'Readiness notes']) {
    const id = (await ok(alice.context, origin, 'POST', '/api/pages', { operationKey: randomUUID(), containerId, title })).value.pageId;
    pages.push({ id, title });
    for (const [, person] of members) {
      assert.equal((await ok(person.context, origin, 'GET', `/api/pages/${id}`)).page.title, title, 'Both members can read every target independently of their visit history.');
    }
  }
  const open = async (name, person, target) => {
    await person.page.goto(`${origin}/app/pages/${target.id}`, { waitUntil: 'networkidle' });
    await expect(person.page.getByRole('textbox', { name: 'Page title', exact: true })).toHaveValue(target.title);
    const visit = (await ok(person.context, origin, 'GET', '/api/navigation')).recents.find(row => row.id === target.id);
    assert.ok(visit, 'The native document open committed a recent visit.');
    const { openedAt } = visit;
    const pageId = target.id;
    assert.ok(Number.isFinite(Date.parse(openedAt)));
    issued.push({ member: name, pageId, openedAt });
    return openedAt;
  };
  // The orders deliberately differ even though both members can read all five pages.
  for (const index of [0, 2, 4, 1]) await open('alice', alice, pages[index]);
  for (const index of [2, 3, 0]) await open('bob', bob, pages[index]);
  const aged = {
    alice: [
      { ...pages[1], openedAt: '2024-02-16T20:00:00.000Z', day: '2024-02-16' },
      { ...pages[4], openedAt: '2024-02-15T07:30:00.000Z', day: '2024-02-14' },
      { ...pages[2], openedAt: '2024-02-15T07:00:00.000Z', day: '2024-02-14' },
      { ...pages[0], openedAt: '2024-02-14T07:30:00.000Z', day: '2024-02-13' },
    ],
    bob: [
      { ...pages[0], openedAt: '2024-02-16T18:00:00.000Z', day: '2024-02-17' },
      { ...pages[3], openedAt: '2024-02-15T18:00:00.000Z', day: '2024-02-16' },
      { ...pages[2], openedAt: '2024-02-14T18:00:00.000Z', day: '2024-02-15' },
    ],
  };
  // Only age genuine issued visits, with both browsers unmounted and the Worker stopped.
  await Promise.all([alice.page.goto('about:blank'), bob.page.goto('about:blank')]);
  const sql = [];
  for (const [name, , memberId] of members) {
    for (const row of [...baseline[name].map(row => ({ ...row, openedAt: '2024-02-10T12:00:00.000Z' })), ...aged[name]]) {
      sql.push(`UPDATE recent_pages SET opened_at='${row.openedAt}' WHERE member_id='${memberId}' AND page_id='${row.id}';`);
    }
  }
  await state.atRest(sql.join('\n'));
  const expected = Object.fromEntries(members.map(([name]) => [name, [
    ...aged[name], ...baseline[name].map(row => ({ ...row, openedAt: '2024-02-10T12:00:00.000Z', day: '2024-02-10' })),
  ]]));
  const project = rows => rows.map(({ id, title, openedAt, day }) => ({ id, title, openedAt, day }));
  const read = async person => project((await ok(person.context, origin, 'GET', '/api/navigation')).recents);
  const groupHeadings = {
    alice: ['16 Feb 2024', '14 Feb 2024', '13 Feb 2024'],
    bob: ['17 Feb 2024', '16 Feb 2024', '15 Feb 2024'],
  };
  const checkHome = async (name, person, rows, headings) => {
    assert.deepEqual(await read(person), rows, `${name}'s exact API history, timestamps and local days`);
    const recents = person.page.locator('.personal-home > section').filter({ has: person.page.getByRole('heading', { name: 'Recent pages', exact: true }) });
    await expect(recents.getByRole('link')).toHaveText(rows.map(row => row.title));
    assert.deepEqual(await recents.getByRole('link').evaluateAll(links => links.map(link => link.getAttribute('href'))), rows.map(row => `/app/pages/${row.id}`));
    await expect(recents.getByRole('heading', { level: 3 })).toHaveText(headings);
    const groups = await recents.locator(':scope > section').evaluateAll(groups => groups.map(group => ({
      heading: group.querySelector('h3').textContent,
      links: [...group.querySelectorAll('a')].map(link => link.getAttribute('href')),
    })));
    const days = [...new Set(rows.map(row => row.day))];
    assert.deepEqual(groups, days.map((day, index) => ({ heading: headings[index], links: rows.filter(row => row.day === day).map(row => `/app/pages/${row.id}`) })), 'Every row belongs to exactly its local day, in newest-first order.');
  };
  for (const [name, person] of members) {
    if (baseline[name].length) groupHeadings[name].push('10 Feb 2024');
    await person.page.goto(origin + '/app', { waitUntil: 'networkidle' });
    await checkHome(name, person, expected[name], groupHeadings[name]);
    await person.page.reload({ waitUntil: 'networkidle' });
    await checkHome(name, person, expected[name], groupHeadings[name]);
    await accessible(person.page, 'personal recents across local days');
    await people.shot(name, 'recents across local days');
  }
  // Reopen an older entry through Home itself: one row moves, every other row stays put.
  const old = pages[0];
  await alice.page.locator('.personal-home > section').filter({ has: alice.page.getByRole('heading', { name: 'Recent pages', exact: true }) }).getByRole('link', { name: old.title, exact: true }).click();
  await expect(alice.page).toHaveURL(`${origin}/app/pages/${old.id}`);
  await expect(alice.page.getByRole('textbox', { name: 'Page title', exact: true })).toHaveValue(old.title);
  const openedAt = (await read(alice)).find(row => row.id === old.id).openedAt;
  assert.ok(Date.parse(openedAt) > Date.parse(aged.alice[0].openedAt));
  // Pin the display clock to this native receipt, never a wall-clock day boundary.
  await alice.page.clock.setFixedTime(new Date(openedAt));
  const next = [{ ...old, openedAt, day: new Intl.DateTimeFormat('en-CA', { timeZone: westCoast, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(openedAt)) }, ...expected.alice.filter(row => row.id !== old.id)];
  const headings = ['Today', '16 Feb 2024', '14 Feb 2024', ...(baseline.alice.length ? ['10 Feb 2024'] : [])];
  for (const reload of [false, true]) {
    if (reload) await alice.page.reload({ waitUntil: 'networkidle' });
    else await alice.page.goto(origin + '/app', { waitUntil: 'networkidle' });
    await checkHome('alice', alice, next, headings);
    await bob.page.reload({ waitUntil: 'networkidle' });
    await checkHome('bob', bob, expected.bob, groupHeadings.bob);
  }
  assert.equal(next.length, expected.alice.length, 'Reopening never duplicates a recent entry.');
  await people.shot('alice', 'older recent moved to front');
  const evidence = { issued, aged, before: expected, after: { alice: next, bob: expected.bob } };
  people.record('recents', evidence);
  await writeFile(path.join(people.evidence, 'recents.json'), JSON.stringify(evidence, null, 2));
  for (const [name, person] of members) {
    const current = await ok(person.context, origin, 'GET', '/api/navigation/preferences');
    await ok(person.context, origin, 'PUT', '/api/navigation/preferences', { operationKey: randomUUID(), expectedRevisionId: current.revisionId, value: preferences[name] });
    await person.page.clock.setFixedTime(new Date());
  }
}
