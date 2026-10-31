import { env } from 'cloudflare:test';
import { beforeEach, expect } from 'vitest';
import { createApi } from '../../../src/core/app/hono';
import { contract } from '../contract';
import { resetDeployment } from '../setup/reset-deployment';
import { seedWorkspace, seedMember, seedContainer, seedContainerGrant, sessionFor } from '../setup/fixtures';

beforeEach(resetDeployment);
const named: Record<string, string> = { 'Meeting notes': 'Meetings', Retrospective: 'Meetings', Decision: 'Decisions', 'How-to guide': 'Documentation', 'Troubleshooting article': 'Documentation', 'Product requirements': 'Planning', 'Project plan': 'Planning', Runbook: 'Operations', 'Onboarding page': 'Teams', 'Team home': 'Teams', 'Policy page': 'Policies' };

contract('TMPL-007', 'every starter template ships from the first sign-in, is found by category, previews, creates working pages and duplicates into an editable copy while the shipped one never changes', async () => {
  const { workspaceId } = await seedWorkspace();
  const people: Record<string, { id: string; cookie: string }> = {};
  for (const name of ['owner', 'teammate']) {
    const { memberId } = await seedMember(workspaceId, { role: name === 'owner' ? 'owner' : 'member', email: [name, 'slate.test'].join('@'), displayName: `${name} Person`, isSetupOwner: name === 'owner' });
    people[name] = { id: memberId, cookie: await sessionFor(memberId) };
  }
  const { containerId } = await seedContainer(workspaceId, { ownerMemberId: people.owner.id, visibility: 'private' });
  for (const name of ['owner', 'teammate']) await seedContainerGrant(containerId, { principalKind: 'member', principalId: people[name].id, level: name === 'owner' ? 'full' : 'edit' });
  const api = createApi();
  const call = async (method: string, path: string, body?: unknown, who = 'owner') => {
    const response = await api.request('https://slate.test/api' + path, { method, headers: { cookie: people[who].cookie, origin: 'https://slate.test', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }, { ...env, SLATE_PROFILE: undefined });
    const value = await response.json<any>();
    return { status: response.status, value };
  };
  const ok = async (method: string, path: string, body?: unknown, who = 'owner') => { const r = await call(method, path, body, who); expect(r.status, JSON.stringify(r.value)).toBeLessThan(300); return r.value; };
  const op = () => crypto.randomUUID();

  // The first read in a new workspace, by a teammate, already lists the whole starter set as shipped workspace templates.
  const all = (await ok('GET', '/templates', undefined, 'teammate')).items.filter((t: any) => t.isShipped);
  expect(all.map((t: any) => t.title).sort()).toEqual(Object.keys(named).sort());
  const ids: Record<string, any> = {};
  for (const [title, category] of Object.entries(named)) {
    const found = (await ok('GET', `/templates?category=${encodeURIComponent(category)}`)).items.find((t: any) => t.title === title);
    expect(found, `${title} in ${category}`).toMatchObject({ category, isShipped: 1, containerId: null });
    ids[title] = found;
    const preview = await ok('GET', `/templates/${found.id}`);
    expect(preview).toMatchObject({ isShipped: true, permissions: { canManage: false, canApply: true, canDuplicate: true } });
    expect(preview.snapshot.blocks.length).toBeGreaterThan(2);
    // Every starter creates a valid page.
    const made = await ok('POST', `/templates/${found.id}/apply`, { operationKey: op(), containerId, expectedRevisionId: preview.revisionId });
    expect((await ok('GET', `/pages/${made.value.pageId}`)).page.title).toBe(title);
  }
  const preview = async (title: string) => (await ok('GET', `/templates/${ids[title].id}`));
  const kinds = async (title: string) => (await preview(title)).snapshot.blocks.map((b: any) => b.blockType);
  expect(JSON.stringify((await preview('Meeting notes')).snapshot.blocks)).toMatch(/Attendees.*Agenda.*Action items/);
  expect(await kinds('Meeting notes')).toContain('task');
  expect(await kinds('Product requirements')).toEqual(expect.arrayContaining(['task-report', 'task', 'table']));
  expect(JSON.stringify((await preview('Product requirements')).snapshot.blocks)).toContain('embedded issue card');
  expect(JSON.stringify((await preview('Policy page')).snapshot.blocks)).toMatch(/Owner.*Review date/);

  // A page from meeting notes: its owner is its creator, and its action item can be assigned with a due date.
  const meeting = await ok('POST', `/templates/${ids['Meeting notes'].id}/apply`, { operationKey: op(), containerId, expectedRevisionId: ids['Meeting notes'].revisionId }, 'teammate');
  const notes = await ok('GET', `/pages/${meeting.value.pageId}`, undefined, 'teammate');
  expect(notes.properties.ownerMemberId).toBe(people.teammate.id);
  const action = notes.blocks.find((b: any) => b.blockType === 'task');
  await ok('PATCH', `/pages/${meeting.value.pageId}/blocks/${action.id}`, { operationKey: op(), expectedRevisionId: action.revisionId, content: { ...action.content, text: [{ text: 'Send the summary' }], assigneeMemberId: people.owner.id, dueDate: '2026-11-02' } }, 'teammate');
  const assigned = (await ok('GET', `/pages/${meeting.value.pageId}`)).blocks.find((b: any) => b.id === action.id);
  expect(assigned.content).toMatchObject({ assigneeMemberId: people.owner.id, dueDate: '2026-11-02', done: false });

  // A non-owner with native edit access owns the complete custom lifecycle.
  const custom = await ok('POST', '/templates', { operationKey: op(), sourcePageId: meeting.value.pageId, includeChildren: false, containerId, title: 'Member procedure', description: 'Authored procedure', category: 'Operations' }, 'teammate');
  const customId = custom.value.id;
  const customRead = () => ok('GET', `/templates/${customId}`, undefined, 'teammate');
  const inState = async (state: string) => (await ok('GET', `/templates?state=${state}&containerId=${containerId}`, undefined, 'teammate')).items.filter((item: any) => item.id === customId);
  const created = await customRead();
  expect(created).toMatchObject({ title: 'Member procedure', isShipped: false, permissions: { canManage: true }, archivedAt: null });
  expect(await inState('active')).toHaveLength(1);
  await ok('POST', '/templates', { operationKey: op(), id: customId, expectedRevisionId: created.revisionId, sourcePageId: meeting.value.pageId, includeChildren: false, containerId, title: 'Updated member procedure', description: 'Edited procedure', category: 'Operations' }, 'teammate');
  const edited = await customRead();
  expect(edited.title).toBe('Updated member procedure');
  expect(edited.revisionId).not.toBe(created.revisionId);
  const change = async (action: string) => {
    const current = await customRead();
    return ok('POST', `/templates/${customId}/change`, { operationKey: op(), expectedRevisionId: current.revisionId, action }, 'teammate');
  };
  await change('archive');
  expect(await inState('active')).toHaveLength(0);
  expect(await inState('archived')).toHaveLength(1);
  expect((await customRead()).archivedAt).toBeTruthy();
  await change('restore');
  expect(await inState('archived')).toHaveLength(0);
  expect(await inState('active')).toHaveLength(1);
  expect(await customRead()).toMatchObject({ archivedAt: null, snapshot: edited.snapshot });
  await change('archive');
  await change('delete');
  expect(await inState('active')).toHaveLength(0);
  expect(await inState('archived')).toHaveLength(0);
  expect((await inState('deleted'))[0]).toMatchObject({ id: customId, title: edited.title, deletedAt: expect.any(String) });
  expect((await call('GET', `/templates/${customId}`, undefined, 'teammate')).status).toBe(404);

  // The retrospective duplicates into an editable copy; the shipped template refuses edits and stays unchanged.
  const shipped = await preview('Retrospective');
  const copy = await ok('POST', `/templates/${shipped.id}/change`, { operationKey: op(), expectedRevisionId: shipped.revisionId, action: 'duplicate' }, 'teammate');
  const copied = await ok('GET', `/templates/${copy.value.id}`, undefined, 'teammate');
  expect(copied).toMatchObject({ isShipped: false, permissions: { canManage: true } });
  const edit = { sourcePageId: meeting.value.pageId, includeChildren: false, containerId: null, title: 'Team retro', description: 'Ours', category: 'Meetings' };
  await ok('POST', '/templates', { operationKey: op(), id: copy.value.id, expectedRevisionId: copied.revisionId, ...edit }, 'teammate');
  expect((await ok('GET', `/templates/${copy.value.id}`)).title).toBe('Team retro');
  for (const [path, body] of [['/templates', { id: shipped.id, ...edit }], [`/templates/${shipped.id}/change`, { action: 'archive' }], [`/templates/${shipped.id}/change`, { action: 'delete' }]] as const) {
    for (const who of ['owner', 'teammate']) {
      const refused = await call('POST', path, { operationKey: op(), expectedRevisionId: shipped.revisionId, ...body }, who);
      expect(refused.status).toBe(403);
      expect(refused.value.code, JSON.stringify(refused.value)).toBe('SHIPPED_TEMPLATE');
      expect(await preview('Retrospective')).toEqual(shipped);
    }
  }
  expect(await preview('Retrospective')).toEqual(shipped);
});
