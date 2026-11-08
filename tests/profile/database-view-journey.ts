import { env } from 'cloudflare:test';
import { expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import type { createApi } from '../../src/core/app/hono';
import { seedMember, sessionFor } from '../e2e/setup/fixtures';

/** Native routes retain block criteria and current-reader results in the default profile. */
export async function databaseViewJourney(api: ReturnType<typeof createApi>, workspaceId: string, containerId: string, ownerId: string, ownerCookie: string) {
  const member = await seedMember(workspaceId, { role: 'member', displayName: 'View editor', email: ['synthetic-slate-218', 'test.invalid'].join('@') });
  const memberCookie = await sessionFor(member.memberId);
  const other = await seedMember(workspaceId, { role: 'member', displayName: 'Other view reader', email: ['synthetic-slate-224', 'test.invalid'].join('@') });
  const otherCookie = await sessionFor(other.memberId);
  async function call(path: string, method = 'GET', body?: unknown, cookie = ownerCookie) {
    return api.request('https://slate.test' + path, { method, headers: { cookie, origin: 'https://slate.test', ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }, env);
  }
  async function ok(path: string, method = 'GET', body?: unknown, cookie = ownerCookie): Promise<any> {
    const response = await call(path, method, body, cookie);
    expect(response.ok, response.ok ? "" : await response.clone().text()).toBe(true);
    return response.json();
  }
  const key = () => crypto.randomUUID();
  const db = await ok('/api/databases', 'POST', { operationKey: key(), containerId, title: 'Source inventory' });
  const databaseId = db.value.id;
  let source = await ok(`/api/databases/${databaseId}`);
  const priorityField = key();
  await ok(`/api/databases/${databaseId}/fields`, 'POST', { operationKey: key(), expectedRevisionId: source.database.revision_id, field: { id: priorityField, name: 'Priority', type: 'number', config: {}, position: 0 } });
  source = await ok(`/api/databases/${databaseId}`);
  const view = { id: key(), name: 'Release work', layout: 'table', filters: [{ field: priorityField, op: 'gte', value: 1 }], sorts: [{ field: '$title', direction: 'asc' }], groups: [], calculations: {}, display: {}, position: 0 };
  await ok(`/api/databases/${databaseId}/views`, 'POST', { operationKey: key(), expectedRevisionId: source.database.revision_id, view });
  source = await ok(`/api/databases/${databaseId}`);
  const grant = (targetId: string, principalId: string, level: string) => ok('/api/sharing', 'POST', { operationKey: key(), targetKind: 'page', targetId, principalKind: 'member', principalId, level });
  await grant(source.database.page_id, member.memberId, 'view');
  await grant(source.database.page_id, other.memberId, 'view');
  const records: string[] = [];
  for (const [title, priority] of [['Alpha visible', 1], ['Bravo private', 2], ['Zulu visible', 3], ['Excluded source record', 0]] as const) {
    const created = await call(`/api/databases/${databaseId}/records`, 'POST', { operationKey: key(), title, values: { [priorityField]: priority } });
    expect(created.status).toBe(201);
    const id = (await created.json<any>()).value.pageId;
    records.push(id);
    await grant(id, ownerId, 'full');
    await ok(`/api/sharing/pages/${id}/inheritance`, 'PUT', { operationKey: key(), expectedRevisionId: (await ok(`/api/pages/${id}`)).page.revisionId, restricted: true });
  }
  for (const id of [records[0]!, records[2]!]) await grant(id, member.memberId, 'view');
  for (const id of [records[1]!, records[2]!]) await grant(id, other.memberId, 'view');
  for (const reader of [member.memberId, other.memberId]) await grant(records[3]!, reader, 'view');
  const pageId = (await ok('/api/pages', 'POST', { operationKey: key(), containerId, title: 'Embedded inventory' })).value.pageId;
  await grant(pageId, ownerId, 'full');
  await ok(`/api/sharing/pages/${pageId}/inheritance`, 'PUT', { operationKey: key(), expectedRevisionId: (await ok(`/api/pages/${pageId}`)).page.revisionId, restricted: true });
  const editGrant = await grant(pageId, member.memberId, 'edit');
  const readerGrant = await grant(pageId, other.memberId, 'view');
  const blockId = key(), definition = { databaseId, viewId: view.id, filters: [], sorts: [{ field: '$title', direction: 'desc' }] };
  const save = { operationKey: key(), expectedRevisionId: (await ok(`/api/pages/${pageId}`, 'GET', undefined, memberCookie)).page.revisionId,
    blocks: [{ id: blockId, blockType: 'database-view', treePosition: 'a', content: { definition } }] };
  await ok(`/api/pages/${pageId}/blocks`, 'PUT', save, memberCookie);
  const saved = await ok(`/api/pages/${pageId}`, 'GET', undefined, memberCookie);
  expect(saved.blocks[0].content).toEqual({ definition });
  const endpoint = `/api/databases/${databaseId}/views/${view.id}/query`;
  const query = (cookie: string) => ok(endpoint, 'POST', { pageId, filters: [], sorts: definition.sorts }, cookie);
  expect((await query(ownerCookie)).records.map((row: any) => row.pageId)).toEqual([records[2], records[1], records[0]]);
  expect((await query(memberCookie)).records.map((row: any) => row.pageId)).toEqual([records[2], records[0]]);
  expect((await query(otherCookie)).records.map((row: any) => row.pageId)).toEqual([records[2], records[1]]);
  for (const cookie of [ownerCookie, memberCookie, otherCookie]) {
    const filtered = await ok(endpoint, 'POST', { pageId, filters: [{ field: priorityField, op: 'gt', value: 2 }], sorts: [{ field: priorityField, direction: 'desc' }] }, cookie);
    expect(filtered.records.map((row: any) => row.pageId)).toEqual([records[2]]);
  }
  expect((await ok(`/api/databases/${databaseId}`)).views).toEqual(source.views);
  const record = await ok(`/api/pages/${records[0]}`);
  await ok(`/api/pages/${records[0]}`, 'PATCH', { operationKey: key(), expectedRevisionId: record.page.revisionId, properties: { title: 'Omega visible' } });
  expect((await query(memberCookie)).records.map((row: any) => row.title)).toEqual(['Zulu visible', 'Omega visible']);
  expect((await query(otherCookie)).records.map((row: any) => row.title)).toEqual(['Zulu visible', 'Bravo private']);
  const malformed = await call(endpoint, 'POST', { pageId, filters: [{ field: 'missing', op: 'eq', value: 'x' }] }, memberCookie);
  expect(malformed.status).toBe(400);
  const missingPage = await call(endpoint, 'POST', { filters: [] }, memberCookie);
  expect(missingPage.status).toBe(400);
  const publicBefore = await ok(`/api/pages/${pageId}`);
  await ok(`/api/publishing/${pageId}`, 'POST', { operationKey: key(), expectedRevisionId: publicBefore.page.revisionId, host: 'localhost:8787', slug: 'embedded-inventory' });
  const publicResponse = await api.request('http://localhost:8787/p/embedded-inventory', {}, env);
  expect(publicResponse.status).toBe(200);
  const publicText = await publicResponse.text();
  expect(publicText).toContain('Sign in to view this database view.');
  for (const hidden of ['Omega visible', 'Bravo private', 'Zulu visible', 'Excluded source record', view.name]) expect(publicText).not.toContain(hidden);
  for (const format of ['markdown', 'html', 'pdf', 'docx']) {
    const exported = await call('/api/exports/readable', 'POST', { scope: 'page', id: pageId, format }, memberCookie);
    expect(exported.status, exported.ok ? "" : await exported.clone().text()).toBe(200);
    const files = unzipSync(new Uint8Array(await exported.arrayBuffer()));
    const text = format === 'docx' ? strFromU8(files['word/document.xml']!)
      : format === 'pdf' ? strFromU8(files[`pages/${pageId}.html`]!)
        : strFromU8(files[`pages/${pageId}.${format === 'markdown' ? 'md' : 'html'}`]!);
    expect(text).toContain(`Database view: Source inventory — ${view.name}`);
    for (const hidden of ['Omega visible', 'Bravo private', 'Zulu visible', 'Excluded source record']) expect(text).not.toContain(hidden);
  }
  await ok('/api/sharing', 'POST', { operationKey: key(), id: editGrant.value.id, targetKind: 'page', targetId: pageId, principalKind: 'member', principalId: member.memberId, level: 'view' });
  const before = await ok(`/api/pages/${pageId}`);
  const denied = { operationKey: key(), expectedRevisionId: before.blocks[0].revisionId, content: { definition: { ...definition, sorts: [] } } };
  expect((await call(`/api/pages/${pageId}/blocks/${blockId}`, 'PATCH', denied, memberCookie)).status).toBe(404);
  expect((await call(`/api/pages/${pageId}/blocks`, 'PUT', save, memberCookie)).status).toBe(404);
  expect((await ok(`/api/pages/${pageId}`)).blocks).toEqual(before.blocks);
  // A captured query cannot outlive access to the embedding page, even with source access.
  await ok('/api/sharing', 'POST', { operationKey: key(), id: readerGrant.value.id, targetKind: 'page', targetId: pageId, principalKind: 'member', principalId: other.memberId, level: 'view', revoke: true });
  expect((await call(endpoint, 'POST', { pageId, filters: [], sorts: definition.sorts }, otherCookie)).status).toBe(404);
  expect((await ok(`/api/databases/${databaseId}`, 'GET', undefined, otherCookie)).views).toEqual(source.views);
  expect((await query(memberCookie)).records.map((row: any) => row.title)).toEqual(['Zulu visible', 'Omega visible']);
  await grant(pageId, other.memberId, 'view');
  // Lost source access clears the query door without changing the block definition.
  const grants = await ok(`/api/sharing/pages/${source.database.page_id}`);
  const sourceGrant = grants.items.find((item: any) => item.principalId === member.memberId);
  await ok('/api/sharing', 'POST', { operationKey: key(), id: sourceGrant.id, targetKind: 'page', targetId: source.database.page_id, principalKind: 'member', principalId: member.memberId, level: 'view', revoke: true });
  // Restrict the source as well, so no container grant can substitute for the revoked grant.
  await grant(source.database.page_id, ownerId, 'full');
  await ok(`/api/sharing/pages/${source.database.page_id}/inheritance`, 'PUT', { operationKey: key(), expectedRevisionId: (await ok(`/api/pages/${source.database.page_id}`)).page.revisionId, restricted: true });
  expect((await call(endpoint, 'POST', { pageId }, memberCookie)).status).toBe(404);
  expect((await query(otherCookie)).records.map((row: any) => row.pageId)).toEqual([records[2], records[1]]);
  const unavailableExport = await call('/api/exports/readable', 'POST', { scope: 'page', id: pageId, format: 'html' }, memberCookie);
  expect(unavailableExport.status).toBe(200);
  const unavailableFiles = unzipSync(new Uint8Array(await unavailableExport.arrayBuffer()));
  const unavailableText = strFromU8(unavailableFiles[`pages/${pageId}.html`]!);
  expect(unavailableText).toContain('Database view unavailable');
  expect(unavailableText).not.toContain('Source inventory');
  expect(unavailableText).not.toContain(view.name);
  expect((await ok(`/api/pages/${pageId}`)).blocks).toEqual(before.blocks);
  expect((await call('/api/auth/logout', 'POST', undefined, memberCookie)).status).toBe(204);
  expect((await call(endpoint, 'POST', { pageId }, memberCookie)).status).toBe(401);
  expect((await call(`/api/pages/${pageId}/blocks`, 'PUT', save, memberCookie)).status).toBe(401);
  expect((await ok(`/api/pages/${pageId}`)).blocks).toEqual(before.blocks);
}
