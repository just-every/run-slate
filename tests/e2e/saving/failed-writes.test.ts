import { SELF } from 'cloudflare:test';
import { beforeEach, expect } from 'vitest';
import { contract } from '../contract';
import { resetDeployment } from '../setup/reset-deployment';
import { seedWorkspace, seedMember, seedContainer, seedContainerGrant, sessionFor } from '../setup/fixtures';

beforeEach(resetDeployment);
contract('SAVE-002', 'refused title and block writes preserve committed data and a corrected retry commits once', async () => {
  const { workspaceId } = await seedWorkspace();
  const { memberId } = await seedMember(workspaceId, { role: 'owner', email: 'owner@slate.test', displayName: 'Alex Owner' });
  const { containerId } = await seedContainer(workspaceId, { ownerMemberId: memberId, visibility: 'private' });
  await seedContainerGrant(containerId, { principalKind: 'member', principalId: memberId, level: 'full' });
  const cookie = await sessionFor(memberId);
  const request = async (method: string, path: string, body?: unknown) => {
    const response = await SELF.fetch(`https://slate.test/api${path}`, { method, headers: { cookie, origin: 'https://slate.test', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json<any>() };
  };
  const blockId = crypto.randomUUID();
  const created = await request('POST', '/pages', { operationKey: crypto.randomUUID(), containerId, title: 'On-call guide', blocks: [{ id: blockId, blockType: 'paragraph', treePosition: '1', content: { text: [{ text: 'Contact the on-call lead.' }] } }] });
  expect(created.status).toBe(200);
  const pageId = created.data.value.pageId, route = `/pages/${pageId}`;
  const before = (await request('GET', route)).data;
  const titleAttempt = { operationKey: crypto.randomUUID(), expectedRevisionId: before.page.revisionId, properties: { title: 'Guide '.repeat(200) } };
  const blockAttempt = { operationKey: crypto.randomUUID(), expectedRevisionId: before.blocks[0].revisionId, content: { text: 'invalid rich text' } };
  for (const [path, body] of [[route, titleAttempt], [`${route}/blocks/${blockId}`, blockAttempt]] as const) {
    expect((await request('PATCH', path, body)).status).toBe(400);
    expect((await request('GET', route)).data).toEqual(before);
  }
  const corrected = { ...titleAttempt, properties: { title: 'On-call escalation guide' } };
  const saved = await request('PATCH', route, corrected);
  expect(saved.status).toBe(200);
  expect((await request('PATCH', route, corrected)).data).toEqual(saved.data);
  const read = (await request('GET', route)).data;
  expect(read.page.title).toBe(corrected.properties.title);
  expect(read.blocks).toEqual(before.blocks);
  expect(read.page.revisionId).toBe(saved.data.value.revisionId);
});
