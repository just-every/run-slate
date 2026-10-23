import { env } from 'cloudflare:test';
import { beforeEach, expect, test } from 'vitest';
import { createApi } from '../../../src/core/app/hono';
import { scheduledAutomation } from '../../../src/core/features/automation/events';
import { nextOccurrence } from '../../../src/core/features/databases/recurrence';
import { contract } from '../contract';
import { resetDeployment } from '../setup/reset-deployment';
import { seedWorkspace, seedMember, seedContainer, seedContainerGrant, sessionFor } from '../setup/fixtures';

beforeEach(resetDeployment);
const zone = 'Australia/Sydney';
const local = (iso: string) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(new Date(iso)).map(p => [p.type, p.value]));
const later = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60000).toISOString();

contract('DB-015', 'record templates fill fields and a body; a weekly schedule in its last saver\'s time zone creates exactly one record per occurrence across restarts, runs as its last saver and pauses with its reason when that saver loses access', async () => {
  const { workspaceId } = await seedWorkspace();
  const people: Record<string, { id: string; cookie: string }> = {};
  for (const name of ['owner', 'editor']) {
    const { memberId } = await seedMember(workspaceId, { role: name === 'owner' ? 'owner' : 'member', email: `${name}@slate.test`, displayName: `${name} Person`, isSetupOwner: name === 'owner' });
    people[name] = { id: memberId, cookie: await sessionFor(memberId) };
  }
  const { containerId } = await seedContainer(workspaceId, { ownerMemberId: people.owner.id, visibility: 'private' });
  await seedContainerGrant(containerId, { principalKind: 'member', principalId: people.owner.id, level: 'full' });
  const { grantId } = await seedContainerGrant(containerId, { principalKind: 'member', principalId: people.editor.id, level: 'edit' });
  const api = createApi();
  const call = async (method: string, path: string, who = 'editor', body?: unknown) => {
    const response = await api.request('https://slate.test/api' + path, { method, headers: { cookie: people[who].cookie, origin: 'https://slate.test', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }, { ...env, SLATE_PROFILE: undefined });
    const value = await response.json<any>();
    expect(response.status, JSON.stringify(value)).toBeLessThan(300);
    return value;
  };
  const op = () => crypto.randomUUID();
  // The schedule's last saver works in Sydney; the schedule takes their personal time zone.
  await call('PUT', '/navigation/preferences', 'editor', { operationKey: op(), expectedRevisionId: null, value: { sidebarCollapsed: false, collapsedContainers: [], timezone: zone, quietRoutine: true } });
  const db = await call('POST', '/databases', 'editor', { operationKey: op(), containerId, title: 'Team syncs' });
  await call('POST', `/databases/${db.value.id}/fields`, 'editor', { operationKey: op(), expectedRevisionId: db.value.revisionId, field: { id: 'points', name: 'Points', type: 'number', config: {}, position: 0 } });
  const body = [{ id: 'agenda', blockType: 'heading', treePosition: '1', content: { level: 2, text: [{ text: 'Agenda' }] } }, { id: 'notes', blockType: 'paragraph', treePosition: '2', content: { text: [{ text: 'Wins, blockers, next steps' }] } }];
  const saved = await call('POST', `/databases/${db.value.id}/templates`, 'editor', { operationKey: op(), name: 'Weekly sync', title: 'Weekly sync notes', values: { points: 3 }, blocks: body, recurrence: { frequency: 'weekly', weekdays: [1, 3], time: '09:00' } });
  expect(saved.value.timezone).toBe(zone);
  const first: string = saved.value.nextOccurrenceAt;
  expect(local(first)).toMatchObject({ hour: '09', minute: '00' });
  expect(['Mon', 'Wed']).toContain(local(first).weekday);

  // Using a template by hand fills its default fields and its body, with fresh block identities.
  const manual = await call('POST', `/databases/${db.value.id}/templates/${saved.value.id}/records`, 'editor', { operationKey: op() });
  expect((await call('GET', `/databases/${db.value.id}/records/${manual.value.pageId}`)).values.points).toBe(3);
  const page = await call('GET', `/pages/${manual.value.pageId}`);
  expect(page.page.title).toBe('Weekly sync notes');
  expect(JSON.stringify(page.blocks)).toContain('Wins, blockers, next steps');
  expect(page.blocks.map((b: any) => b.id)).not.toContain('agenda');

  const scheduled = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM database_record_occurrences WHERE template_id=?').bind(saved.value.id).first<{ n: number }>())!.n;
  const records = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM database_records WHERE database_id=?').bind(db.value.id).first<{ n: number }>())!.n;
  await scheduledAutomation(env, later(first, -1));
  expect(await scheduled()).toBe(0);
  await scheduledAutomation(env, first);
  expect(await scheduled()).toBe(1);
  // A restarted runner passes over the same occurrence again and finds it taken.
  await scheduledAutomation(env, later(first, 5));
  await scheduledAutomation(env, later(first, 5));
  expect(await scheduled()).toBe(1);
  const second: string = (await call('GET', `/databases/${db.value.id}/templates`)).items[0].nextOccurrenceAt;
  expect(second > first).toBe(true);
  expect(local(second)).toMatchObject({ hour: '09', minute: '00' });
  expect(['Mon', 'Wed']).toContain(local(second).weekday);
  await scheduledAutomation(env, second);
  await scheduledAutomation(env, later(second, 1));
  expect(await scheduled()).toBe(2);
  expect(await records()).toBe(3);
  const made = (await env.DB.prepare('SELECT record_page_id FROM database_record_occurrences WHERE template_id=? ORDER BY occurrence_at').bind(saved.value.id).all<{ record_page_id: string }>()).results;
  for (const row of made) expect((await call('GET', `/databases/${db.value.id}/records/${row.record_page_id}`)).values.points).toBe(3);

  // Daily, monthly and yearly schedules land on their local day and time; a missing day runs on the month's last day.
  for (const recurrence of [{ frequency: 'daily', time: '07:30' }, { frequency: 'monthly', dayOfMonth: 31, time: '07:30' }, { frequency: 'yearly', month: 2, dayOfMonth: 29, time: '07:30' }]) {
    const other = await call('POST', `/databases/${db.value.id}/templates`, 'editor', { operationKey: op(), name: `${recurrence.frequency} template`, title: 'Report', values: {}, blocks: [], recurrence });
    const at = local(other.value.nextOccurrenceAt);
    expect(at).toMatchObject({ hour: '07', minute: '30' });
    const daysInMonth = new Date(Date.UTC(+at.year, +at.month, 0)).getUTCDate();
    if (recurrence.frequency !== 'daily') expect(+at.day).toBe(Math.min(recurrence.dayOfMonth!, daysInMonth));
    if (recurrence.frequency === 'yearly') expect(at.month).toBe('02');
    await call('POST', `/databases/${db.value.id}/templates/${other.value.id}/delete`, 'editor', { operationKey: op(), expectedRevisionId: other.value.revisionId });
  }
  expect(local(nextOccurrence({ frequency: 'monthly', dayOfMonth: 31, time: '07:30' }, zone, '2026-11-01T00:00:00.000Z'))).toMatchObject({ month: '11', day: '30', hour: '07' });
  expect(local(nextOccurrence({ frequency: 'yearly', month: 2, dayOfMonth: 29, time: '07:30' }, zone, '2027-01-01T00:00:00.000Z'))).toMatchObject({ year: '2027', month: '02', day: '28' });

  // The owner revokes the last saver's access: the next occurrence pauses the schedule with its reason and creates nothing.
  await call('POST', '/sharing', 'owner', { operationKey: op(), targetKind: 'container', targetId: containerId, id: grantId, principalKind: 'member', principalId: people.editor.id, level: 'edit', revoke: true });
  const third: string = (await call('GET', `/databases/${db.value.id}/templates`, 'owner')).items[0].nextOccurrenceAt;
  await scheduledAutomation(env, third);
  await scheduledAutomation(env, later(third, 60 * 24 * 7));
  expect(await scheduled()).toBe(2);
  const paused = (await call('GET', `/databases/${db.value.id}/templates`, 'owner')).items[0];
  expect(paused).toMatchObject({ pausedAt: third, nextOccurrenceAt: null, lastSaver: { id: people.editor.id, name: 'editor Person' }, creator: { id: people.editor.id } });
  expect(paused.pausedReason).toBe('Paused: editor Person can no longer add records to this database. Save the schedule again to resume it as yourself.');
  // Saving it again resumes it as the saver, from now.
  const resumed = await call('POST', `/databases/${db.value.id}/templates`, 'owner', { operationKey: op(), id: paused.id, expectedRevisionId: paused.revisionId, name: paused.name, title: paused.title, values: paused.values, blocks: body, recurrence: paused.recurrence });
  expect((await call('GET', `/databases/${db.value.id}/templates`, 'owner')).items[0]).toMatchObject({ pausedAt: null, pausedReason: null, lastSaver: { id: people.owner.id, name: 'owner Person' }, nextOccurrenceAt: resumed.value.nextOccurrenceAt });
});
test('record templates show each database viewer only the page mention titles they can open', async () => {
  const { workspaceId } = await seedWorkspace();
  const owner = (await seedMember(workspaceId, { role: 'owner', email: 'owner@slate.test', displayName: 'Owner Person', isSetupOwner: true })).memberId;
  const viewer = (await seedMember(workspaceId, { role: 'member', email: 'viewer@slate.test', displayName: 'Viewer Person' })).memberId;
  const shared = (await seedContainer(workspaceId, { ownerMemberId: owner, visibility: 'private' })).containerId;
  const restricted = (await seedContainer(workspaceId, { ownerMemberId: owner, visibility: 'private' })).containerId;
  for (const containerId of [shared, restricted]) await seedContainerGrant(containerId, { principalKind: 'member', principalId: owner, level: 'full' });
  await seedContainerGrant(shared, { principalKind: 'member', principalId: viewer, level: 'view' });
  const cookies: Record<string, string> = { owner: await sessionFor(owner), viewer: await sessionFor(viewer) }, api = createApi(), op = () => crypto.randomUUID();
  const call = async (method: string, path: string, who: string, body?: unknown) => {
    const response = await api.request('https://slate.test/api' + path, { method, headers: { cookie: cookies[who]!, origin: 'https://slate.test', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }, { ...env, SLATE_PROFILE: undefined });
    const text = await response.text();
    expect(response.status, text).toBeLessThan(300);
    return { value: JSON.parse(text), text };
  };
  const memo = (await call('POST', '/pages', 'owner', { operationKey: op(), containerId: restricted, title: 'Restricted merger memo' })).value.value.pageId;
  const db = (await call('POST', '/databases', 'owner', { operationKey: op(), containerId: shared, title: 'Deal tracker' })).value.value.id;
  const blocks = [{ id: 'brief', blockType: 'paragraph', treePosition: '1', content: { text: [{ text: 'Background: ' }, { text: 'Restricted merger memo', mention: { kind: 'page', id: memo, label: 'Restricted merger memo' } }] } }];
  await call('POST', `/databases/${db}/templates`, 'owner', { operationKey: op(), name: 'Deal intake', title: 'New deal', values: {}, blocks, recurrence: null });
  expect((await call('GET', `/databases/${db}/templates`, 'owner')).text).toContain('Restricted merger memo');
  const listed = await call('GET', `/databases/${db}/templates`, 'viewer');
  expect(listed.value.items.map((item: { name: string }) => item.name)).toEqual(['Deal intake']);
  expect(listed.text).not.toContain('Restricted merger memo');
});
