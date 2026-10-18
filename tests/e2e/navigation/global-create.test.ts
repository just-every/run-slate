import { SELF } from 'cloudflare:test';
import { beforeEach, expect } from 'vitest';
import { contract } from '../contract';
import { resetDeployment } from '../setup/reset-deployment';
import { seedWorkspace, seedMember, seedContainerGrant, sessionFor } from '../setup/fixtures';

beforeEach(resetDeployment);
contract('NAV-005', 'creation names authorized destinations and creates pages, databases, spaces and template copies', async () => {
  const { workspaceId } = await seedWorkspace();
  const { memberId: owner } = await seedMember(workspaceId, { role: 'owner', email: 'owner@slate.test', displayName: 'Alex Owner', isSetupOwner: true });
  const { memberId: reader } = await seedMember(workspaceId, { role: 'member', email: 'reader@slate.test', displayName: 'Morgan Reader' });
  const cookies = { owner: await sessionFor(owner), reader: await sessionFor(reader) };
  const call = async (method: string, route: string, body?: unknown, actor: 'owner' | 'reader' = 'owner') => {
    const response = await SELF.fetch(`https://slate.test/api${route}`, { method, headers: { cookie: cookies[actor], origin: 'https://slate.test', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json<any>() };
  };
  const firstRun = await call('POST', '/workspace/first-run', { operationKey: crypto.randomUUID(), workspaceName: 'Field notes', containerName: 'Handbook', pageTitle: 'Welcome' });
  expect(firstRun.status).toBe(200);
  const containerId = firstRun.data.value.containerId;
  await seedContainerGrant(containerId, { principalKind: 'member', principalId: reader, level: 'view' });
  expect((await call('GET', '/containers')).data.items.find((space: any) => space.id === containerId).permissions.canCreatePages).toBe(true);
  expect((await call('GET', '/containers', undefined, 'reader')).data.items.find((space: any) => space.id === containerId).permissions.canCreatePages).toBe(false);
  const input = { operationKey: crypto.randomUUID(), containerId, title: 'Incident playbook' };
  const page = await call('POST', '/pages', input);
  expect(page.status).toBe(200);
  expect((await call('POST', '/pages', input)).data.value.pageId).toBe(page.data.value.pageId);
  expect((await call('GET', `/pages/${page.data.value.pageId}`)).data.page.containerId).toBe(containerId);
  const database = await call('POST', '/databases', { operationKey: crypto.randomUUID(), containerId, title: 'Service ownership' });
  expect(database.status).toBe(201);
  expect((await call('GET', `/pages/${database.data.value.pageId}`)).data.page.containerId).toBe(containerId);
  const template = await call('POST', '/templates', { operationKey: crypto.randomUUID(), sourcePageId: firstRun.data.value.pageId, includeChildren: false, containerId: null, title: 'Incident template', description: 'Reusable incident notes', category: 'Operations' });
  expect(template.status).toBe(201);
  expect((await call('GET', '/templates?category=&containerId=&query=')).data.items.map((item: any) => item.id)).toContain(template.data.value.id);
  const preview = (await call('GET', `/templates/${template.data.value.id}`)).data;
  expect(preview.applyDestinations.some((destination: any) => destination.containerId === containerId)).toBe(true);
  const copy = await call('POST', `/templates/${template.data.value.id}/apply`, { operationKey: crypto.randomUUID(), expectedRevisionId: preview.revisionId, containerId });
  expect(copy.status).toBe(201);
  expect(copy.data.value.pageId).not.toBe(page.data.value.pageId);
  expect((await call('GET', `/pages/${copy.data.value.pageId}`)).data.page.containerId).toBe(containerId);
  expect((await call('POST', '/containers', { operationKey: crypto.randomUUID(), name: 'Customer success', visibility: 'private' })).status).toBe(200);
  for (const [route, body] of [
    ['/pages', { operationKey: crypto.randomUUID(), containerId, title: 'Forbidden page' }],
    ['/databases', { operationKey: crypto.randomUUID(), containerId, title: 'Forbidden database' }],
    [`/templates/${template.data.value.id}/apply`, { operationKey: crypto.randomUUID(), expectedRevisionId: preview.revisionId, containerId }],
  ] as const) expect((await call('POST', route, body, 'reader')).status).toBe(404);
});
