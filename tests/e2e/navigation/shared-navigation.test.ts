import { SELF } from 'cloudflare:test';
import { beforeEach, expect } from 'vitest';
import { contract } from '../contract';
import { resetDeployment } from '../setup/reset-deployment';
import { seedWorkspace, seedMember, sessionFor } from '../setup/fixtures';

beforeEach(resetDeployment);

contract('TREE-003', 'individual sharing lists named non-member pages and subtrees until the current grant ends', async () => {
  const { workspaceId } = await seedWorkspace();
  const { memberId: owner } = await seedMember(workspaceId, { role: 'owner', email: 'owner@slate.test', displayName: 'Alex Owner', isSetupOwner: true });
  const { memberId: reader } = await seedMember(workspaceId, { role: 'member', email: 'reader@slate.test', displayName: 'Morgan Reader' });
  const cookies = { owner: await sessionFor(owner, { freshProof: true }), reader: await sessionFor(reader) };
  const call = async (method: string, route: string, body?: unknown, actor: 'owner' | 'reader' = 'owner') => {
    const response = await SELF.fetch(`https://slate.test/api${route}`, {
      method, headers: { cookie: cookies[actor], origin: 'https://slate.test', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json<any>() };
  };
  const write = async (route: string, body: Record<string, unknown>) => {
    const response = await call('POST', route, { operationKey: crypto.randomUUID(), ...body });
    expect(response.status).toBe(200);
    return response.data.value;
  };
  const createPage = async (containerId: string, title: string, parentPageId?: string) =>
    (await write('/pages', { containerId, title, parentPageId })).pageId as string;
  const share = (targetId: string, extra: Record<string, unknown> = {}) => write('/sharing', {
    targetKind: 'page', targetId, principalKind: 'member', principalId: reader, level: 'view', ...extra,
  });
  const readTree = async () => (await call('GET', '/pages', undefined, 'reader')).data.items as { id: string; title: string; sharedWithMe: boolean; containerLabel: string }[];

  const privateSpace = await write('/containers', { name: 'Supplier operations', visibility: 'private' });
  const parent = await createPage(privateSpace.id, 'Confidential supplier negotiations');
  const child = await createPage(privateSpace.id, 'Supplier escalation contacts', parent);
  const descendant = await createPage(privateSpace.id, 'Weekend escalation rota', child);
  const sibling = await createPage(privateSpace.id, 'Unannounced supplier change', parent);
  expect((await readTree()).some(page => page.id === child)).toBe(false);
  const individual = await share(child);
  let tree = await readTree();
  expect(tree.filter(page => page.sharedWithMe).map(page => page.id).sort()).toEqual([child, descendant].sort());
  expect(tree.find(page => page.id === child)).toMatchObject({ containerLabel: 'Supplier operations', sharedWithMe: true });
  expect(tree.some(page => page.id === parent || page.id === sibling)).toBe(false);
  expect(JSON.stringify(tree)).not.toContain('Confidential supplier negotiations');
  expect(JSON.stringify(tree)).not.toContain('Unannounced supplier change');
  expect((await call('GET', `/pages/${child}`, undefined, 'reader')).data.page.id).toBe(child);
  expect((await call('GET', `/pages/${parent}`, undefined, 'reader')).status).toBe(404);
  expect((await call('GET', '/containers', undefined, 'reader')).data.items.some((space: any) => space.id === privateSpace.id)).toBe(false);
  expect((await call('GET', '/pages')).data.items.find((page: any) => page.id === child).sharedWithMe).toBe(false);
  await share(child, { id: individual.id, revoke: true });
  tree = await readTree();
  expect(tree.some(page => page.id === child || page.id === descendant)).toBe(false);
  expect((await call('GET', `/pages/${child}`, undefined, 'reader')).status).toBe(404);

  // Container discovery and stronger general access do not erase individual provenance.
  const openSpace = await write('/containers', { name: 'Engineering handbook', visibility: 'open' });
  const general = await createPage(openSpace.id, 'On-call handover');
  const generalChild = await createPage(openSpace.id, 'Handover checklist', general);
  const ordinary = await createPage(openSpace.id, 'Release process');
  expect((await call('GET', '/containers', undefined, 'reader')).data.items.some((space: any) => space.id === openSpace.id)).toBe(true);
  expect((await call('GET', '/navigation', undefined, 'reader')).data.containers.some((space: any) => space.id === openSpace.id)).toBe(false);
  expect((await readTree()).find(page => page.id === general)?.sharedWithMe).toBe(false);
  const overlapping = await share(general);
  tree = await readTree();
  expect(tree.find(page => page.id === general)).toMatchObject({ sharedWithMe: true, containerLabel: 'Engineering handbook' });
  expect(tree.find(page => page.id === generalChild)?.sharedWithMe).toBe(true);
  expect(tree.find(page => page.id === ordinary)?.sharedWithMe).toBe(false);
  await share(general, { id: overlapping.id, revoke: true });
  tree = await readTree();
  expect(tree.find(page => page.id === general)?.sharedWithMe).toBe(false);
  expect(tree.find(page => page.id === generalChild)?.sharedWithMe).toBe(false);
  expect((await call('GET', `/pages/${general}`, undefined, 'reader')).status).toBe(200);
  await share(general, { expiresAt: '2000-01-01T00:00:00.000Z' });
  tree = await readTree();
  expect(tree.find(page => page.id === general)?.sharedWithMe).toBe(false);
  expect(tree.find(page => page.id === generalChild)?.sharedWithMe).toBe(false);
  expect(tree.filter(page => page.sharedWithMe)).toEqual([]);
});
