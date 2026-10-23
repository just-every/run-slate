import {cardCase} from './card-case';
import { env } from 'cloudflare:test';
import { beforeEach, expect } from 'vitest';
import { unzipSync } from 'fflate';
import { createApi } from '../../../src/core/app/hono';
import { contract } from '../contract';
import { resetDeployment } from '../setup/reset-deployment';
import { seedWorkspace, seedMember, seedContainer, seedContainerGrant, sessionFor } from '../setup/fixtures';

beforeEach(resetDeployment);
contract('PAGE-012', 'page display is shared, content preserving and retained by readable and complete workspace archives', async () => {
  const { workspaceId } = await seedWorkspace();
  const { memberId: owner } = await seedMember(workspaceId, { role: 'owner', email: 'owner@slate.test', displayName: 'Alex Owner', isSetupOwner: true });
  const { memberId: reader } = await seedMember(workspaceId, { role: 'member', email: 'reader@slate.test', displayName: 'Morgan Reader' });
  const { containerId } = await seedContainer(workspaceId, { ownerMemberId: owner, visibility: 'open' });
  await seedContainerGrant(containerId, { principalKind: 'member', principalId: owner, level: 'full' });
  await seedContainerGrant(containerId, { principalKind: 'member', principalId: reader, level: 'view' });
  const cookies = { owner: await sessionFor(owner, { freshProof: true }), reader: await sessionFor(reader) };
  const api = createApi();
  const request = (method: string, path: string, body?: unknown, actor: 'owner' | 'reader' = 'owner') => api.request('https://slate.test/api' + path, {
    method, headers: { cookie: cookies[actor], origin: 'https://slate.test', ...(body instanceof FormData ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  }, { ...env, SLATE_PROFILE: undefined });
  const json = async (method: string, path: string, body?: unknown, actor: 'owner' | 'reader' = 'owner') => {
    const response = await request(method, path, body, actor);
    const data = await response.json<any>();
    expect(response.status, JSON.stringify(data)).toBe(200);
    return data;
  };
  const displays = [
    { typeface: 'default', smallText: false, fullWidth: false },
    { typeface: 'serif', smallText: true, fullWidth: true },
    { typeface: 'mono', smallText: false, fullWidth: true },
  ];
  const originals: { id: string; title: string; display: typeof displays[number]; content: unknown }[] = [];
  for (const display of displays) {
    const created = await json('POST', '/pages', { operationKey: crypto.randomUUID(), containerId, title: `Operations ${display.typeface}`, blocks: [{ id: crypto.randomUUID(), blockType: 'paragraph', content: { text: [{ text: 'Confirm the incident owner before updating production.' }] }, treePosition: 'a' }] });
    const id = created.value.pageId;
    const before = await json('GET', `/pages/${id}`);
    const edit = { operationKey: crypto.randomUUID(), expectedRevisionId: before.page.revisionId, properties: display };
    const changed = await json('PATCH', `/pages/${id}`, edit);
    expect(changed.document.properties).toMatchObject(display);
    expect(changed.document.blocks).toEqual(before.blocks);
    expect((await json('GET', `/pages/${id}`, undefined, 'reader')).properties).toEqual(changed.document.properties);
    expect((await request('PATCH', `/pages/${id}`, { ...edit, operationKey: crypto.randomUUID(), expectedRevisionId: changed.document.page.revisionId }, 'reader')).status).toBe(404);
    originals.push({ id, title: before.page.title, display, content: before.blocks[0].content });
  }
  for (const format of ['markdown', 'html', 'pdf']) {
    const previousIds = new Set((await json('GET', '/pages')).items.map((page: any) => page.id));
    const response = await request('POST', '/exports/readable', { scope: 'container', id: containerId, format });
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const entries = unzipSync(bytes);
    const manifest = JSON.parse(new TextDecoder().decode(entries['slate-readable.json']));
    for (const original of originals) expect(manifest.pages.find((page: any) => page.id === original.id).display).toEqual(original.display);
    const form = new FormData();
    form.set('file', new File([bytes], `operations-${format}.zip`));
    form.set('format', 'slate-readable'); form.set('operationKey', crypto.randomUUID());
    const upload = await json('POST', '/imports', form);
    const job = await json('POST', `/imports/${upload.id}/run`, {});
    expect(job.state).toBe('completed');
    const copies = (await json('GET', '/pages')).items.filter((page: any) => !previousIds.has(page.id));
    expect(copies).toHaveLength(originals.length);
    for (const original of originals) {
      const copy = copies.find((page: any) => page.title === original.title);
      expect(copy).toBeDefined();
      const document = await json('GET', `/pages/${copy.id}`);
      expect(document.properties).toMatchObject(original.display);
      expect(document.blocks[0].content).toEqual(original.content);
    }
  }
  const exported = await json('POST', '/exports/workspace', { operationKey: crypto.randomUUID() });
  const download = await request('GET', `/exports/${exported.id}/download`);
  expect(download.status).toBe(200);
  const bytes = new Uint8Array(await download.arrayBuffer());
  const manifest = JSON.parse(new TextDecoder().decode(unzipSync(bytes)['manifest.json']));
  for (const original of originals) expect(manifest.tables.pages.find((page: any) => page.id === original.id)).toMatchObject({ typeface: original.display.typeface, small_text: +original.display.smallText, full_width: +original.display.fullWidth });
  await resetDeployment();
  const fresh = await seedWorkspace();
  const freshOwner = await seedMember(fresh.workspaceId, { role: 'owner', email: 'owner@slate.test', displayName: 'Alex Owner', isSetupOwner: true });
  cookies.owner = await sessionFor(freshOwner.memberId, { freshProof: true });
  const restore = new FormData(); restore.set('file', new File([bytes], 'workspace.zip'));
  expect((await json('POST', '/exports/restore', restore)).state).toBe('completed');
  // Restoring replaces the session table; sign in as the restored owner identity.
  cookies.owner = await sessionFor(owner, { freshProof: true });
  for (const original of originals) {
    const document = await json('GET', `/pages/${original.id}`);
    expect(document.properties).toMatchObject(original.display);
    expect(document.blocks[0].content).toEqual(original.content);
  }
  await cardCase();
});
