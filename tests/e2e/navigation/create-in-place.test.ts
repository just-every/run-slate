import { env } from 'cloudflare:test';
import { beforeEach, expect } from 'vitest';
import { createApi } from '../../../src/core/app/hono';
import { contract } from '../contract';
import { resetDeployment } from '../setup/reset-deployment';
import { seedWorkspace, seedMember, seedContainer, seedContainerGrant, sessionFor } from '../setup/fixtures';

beforeEach(resetDeployment);
contract('TREE-005', 'root and child creation retain their chosen destination and refuse read-only destinations', async () => {
  const { workspaceId } = await seedWorkspace();
  const { memberId: owner } = await seedMember(workspaceId, { role: 'owner', email: 'owner@slate.test', displayName: 'Alex Owner' });
  const { memberId: reader } = await seedMember(workspaceId, { role: 'member', email: 'reader@slate.test', displayName: 'Morgan Reader' });
  const { containerId } = await seedContainer(workspaceId, { ownerMemberId: owner, visibility: 'open' });
  await seedContainerGrant(containerId, { principalKind: 'member', principalId: owner, level: 'full' });
  await seedContainerGrant(containerId, { principalKind: 'member', principalId: reader, level: 'view' });
  const cookies = { owner: await sessionFor(owner), reader: await sessionFor(reader) };
  const api = createApi();
  const request = async (method: string, path: string, body?: unknown, actor: 'owner' | 'reader' = 'owner') => {
    const response = await api.request('https://slate.test/api' + path, { method, headers: { cookie: cookies[actor], origin: 'https://slate.test', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }, { ...env, SLATE_PROFILE: undefined });
    return { status: response.status, data: await response.json<any>() };
  };
  const root = await request('POST', '/pages', { operationKey: crypto.randomUUID(), containerId, title: 'Engineering handbook' });
  expect(root.status).toBe(200);
  const parentPageId = root.data.value.pageId;
  const input = { operationKey: crypto.randomUUID(), containerId, parentPageId, title: 'Incident response' };
  const child = await request('POST', '/pages', input);
  expect(child.status).toBe(200);
  expect((await request('POST', '/pages', input)).data.value.pageId).toBe(child.data.value.pageId);
  expect((await request('GET', `/pages/${child.data.value.pageId}`)).data).toMatchObject({ parentPageId, page: { containerId } });
  const tree = (await request('GET', '/pages')).data.items;
  expect(tree.filter((page: any) => page.id === child.data.value.pageId)).toHaveLength(1);
  expect(tree.find((page: any) => page.id === parentPageId).parentPageId).toBeNull();
  const choices = (await request('GET', '/containers', undefined, 'reader')).data.items;
  expect(choices.find((space: any) => space.id === containerId).permissions.canCreatePages).toBe(false);
  for (const parent of [undefined, parentPageId]) {
    expect((await request('POST', '/pages', { operationKey: crypto.randomUUID(), containerId, parentPageId: parent, title: 'Refused' }, 'reader')).status).toBe(404);
  }
  expect((await request('GET', '/pages')).data.items).toHaveLength(2);
});
