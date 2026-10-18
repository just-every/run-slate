import { env } from 'cloudflare:test';
import { beforeEach, expect } from 'vitest';
import { createApi } from '../../../src/core/app/hono';
import { contract } from '../contract';
import { resetDeployment } from '../setup/reset-deployment';
import { seedWorkspace, seedMember, seedContainer, seedContainerGrant, sessionFor } from '../setup/fixtures';

beforeEach(resetDeployment);
contract('PAGE-011', 'presentation content uses the authorized page document and never changes its revision', async () => {
  const { workspaceId } = await seedWorkspace();
  const { memberId: owner } = await seedMember(workspaceId, { role: 'owner', email: 'owner@slate.test', displayName: 'Alex Owner', isSetupOwner: true });
  const { memberId: reader } = await seedMember(workspaceId, { role: 'member', email: 'reader@slate.test', displayName: 'Morgan Reader' });
  const { memberId: outsider } = await seedMember(workspaceId, { role: 'member', email: 'outsider@slate.test', displayName: 'Casey Outsider' });
  const { containerId } = await seedContainer(workspaceId, { ownerMemberId: owner, visibility: 'private' });
  await seedContainerGrant(containerId, { principalKind: 'member', principalId: owner, level: 'full' });
  await seedContainerGrant(containerId, { principalKind: 'member', principalId: reader, level: 'view' });
  const cookies = { owner: await sessionFor(owner), reader: await sessionFor(reader), outsider: await sessionFor(outsider) };
  const api = createApi();
  const request = (path: string, actor: keyof typeof cookies, body?: unknown) => api.request('https://slate.test/api' + path, { method: body ? 'POST' : 'GET', headers: { cookie: cookies[actor], origin: 'https://slate.test', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }, { ...env, SLATE_PROFILE: undefined });
  const created = await request('/pages', 'owner', { operationKey: crypto.randomUUID(), containerId, title: 'Weekly operations review', blocks: [
    { id: crypto.randomUUID(), blockType: 'heading', content: { level: 1, text: [{ text: 'Service health' }] }, treePosition: 'a' },
    { id: crypto.randomUUID(), blockType: 'paragraph', content: { text: [{ text: 'All services healthy.' }] }, treePosition: 'b' },
    { id: crypto.randomUUID(), blockType: 'heading', content: { level: 1, text: [{ text: 'Follow-up owners' }] }, treePosition: 'c' },
  ] });
  expect(created.status).toBe(200);
  const { value: { pageId } } = await created.json<any>();
  const source = await (await request(`/pages/${pageId}`, 'owner')).json<any>();
  const response = await request(`/pages/${pageId}`, 'reader');
  expect(response.status).toBe(200);
  const document = await response.json<any>();
  expect(document.blocks).toEqual(source.blocks);
  expect(document.permissions.canEdit).toBe(false);
  expect((await request(`/pages/${pageId}`, 'outsider')).status).toBe(404);
  expect((await (await request(`/pages/${pageId}`, 'owner')).json<any>()).page.revisionId).toBe(source.page.revisionId);
});
