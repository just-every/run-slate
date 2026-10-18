import { SELF } from 'cloudflare:test';
import { beforeEach, expect } from 'vitest';
import { contract } from '../contract';
import { resetDeployment } from '../setup/reset-deployment';
import { seedWorkspace, seedMember, seedContainer, seedContainerGrant, sessionFor } from '../setup/fixtures';

beforeEach(resetDeployment);
contract('TREE-004', 'tree inputs expose only readable titles and retain member expansion across filtered reads', async () => {
  const { workspaceId } = await seedWorkspace();
  const { memberId: owner } = await seedMember(workspaceId, { role: 'owner', email: 'owner@slate.test', displayName: 'Alex Owner' });
  const { memberId: reader } = await seedMember(workspaceId, { role: 'member', email: 'reader@slate.test', displayName: 'Morgan Reader' });
  const { containerId } = await seedContainer(workspaceId, { ownerMemberId: owner, visibility: 'open' });
  await seedContainerGrant(containerId, { principalKind: 'member', principalId: owner, level: 'full' });
  await seedContainerGrant(containerId, { principalKind: 'member', principalId: reader, level: 'view' });
  const cookies = { owner: await sessionFor(owner), reader: await sessionFor(reader) };
  const call = async (method: string, path: string, body?: unknown, actor: 'owner' | 'reader' = 'owner') => {
    const response = await SELF.fetch(`https://slate.test/api${path}`, { method, headers: { cookie: cookies[actor], origin: 'https://slate.test', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json<any>() };
  };
  const create = async (title: string, parentPageId?: string) => {
    const result = await call('POST', '/pages', { operationKey: crypto.randomUUID(), containerId, title, parentPageId });
    expect(result.status).toBe(200); return result.data.value.pageId as string;
  };
  const parent = await create('Confidential rota planning');
  const child = await create('Shared rota contacts', parent);
  expect((await call('POST', '/sharing', { operationKey: crypto.randomUUID(), targetKind: 'page', targetId: parent, principalKind: 'member', principalId: owner, level: 'full' })).status).toBe(200);
  const document = (await call('GET', `/pages/${parent}`)).data;
  expect((await call('PUT', `/sharing/pages/${parent}/inheritance`, { operationKey: crypto.randomUUID(), expectedRevisionId: document.page.revisionId, restricted: true })).status).toBe(200);
  expect((await call('POST', '/sharing', { operationKey: crypto.randomUUID(), targetKind: 'page', targetId: child, principalKind: 'member', principalId: reader, level: 'view' })).status).toBe(200);
  expect((await call('POST', `/pages/${parent}/expansion`, { operationKey: crypto.randomUUID(), expanded: true })).status).toBe(200);
  const ownerTree = (await call('GET', '/pages')).data.items;
  expect(ownerTree.map((page: any) => page.id)).toEqual(expect.arrayContaining([parent, child]));
  const readerTree = (await call('GET', '/pages', undefined, 'reader')).data.items;
  expect(readerTree.map((page: any) => page.id)).toEqual([child]);
  expect(JSON.stringify(readerTree)).not.toContain('Confidential rota planning');
  expect((await call('GET', `/pages/${parent}/expansion`, undefined, 'reader')).status).toBe(404);
  expect((await call('GET', `/pages/${child}/expansion`, undefined, 'reader')).data).toEqual({ expanded: false });
  expect((await call('GET', `/pages/${parent}/expansion`)).data).toEqual({ expanded: true });
});
