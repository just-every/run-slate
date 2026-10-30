import { env } from 'cloudflare:test';
import { expect } from 'vitest';
import { createUlid } from '../../../src/core/shared/ulid';
import { scheduledDiscovery } from '../../../src/core/features/notifications/jobs';

type Fixture = {
  w: string; a: string; b: string; containerId: string;
  request(method: string, path: string, body?: unknown, actor?: string): Promise<{status: number; data: any}>;
};

/** Exercise the retained trash route both ways and inspect durable notification intent. */
export async function draftDispositionJourney(f: Fixture) {
  const send = async (method: string, route: string, body?: unknown, actor = f.a) => {
    const response = await f.request(method, route, body, actor);
    expect(response.status, JSON.stringify(response.data)).toBe(200);
    return response.data;
  };
  await send('PUT', '/api/navigation/container-watches', { operationKey: createUlid(), containerId: f.containerId, enabled: true }, f.b);
  const control = await send('POST', '/api/pages', { operationKey: createUlid(), containerId: f.containerId, title: 'Visible notification control' });
  await scheduledDiscovery(env);
  const notifications = async () => ({
    inbox: (await env.DB.prepare('SELECT * FROM notifications WHERE workspace_id=? ORDER BY id').bind(f.w).all()).results,
    outbox: (await env.DB.prepare('SELECT * FROM notification_outbox WHERE workspace_id=? ORDER BY id').bind(f.w).all()).results,
  });
  const baseline = await notifications();
  expect(baseline.inbox.some(row => row.source_page_id === control.value.pageId && row.recipient_member_id === f.b)).toBe(true);
  const tree = (await send('GET', '/api/pages', undefined, f.b)).items;
  await env.DB.prepare('INSERT INTO workspace_policies VALUES (?,?,?)').bind(f.w, JSON.stringify({'page.lifecycle.v1':'draft-then-publish'}), new Date().toISOString()).run();
  const created = await send('POST', '/api/pages', { operationKey: createUlid(), containerId: f.containerId, title: 'Private retained draft', blocks: [{ id: createUlid(), blockType: 'paragraph', treePosition: '1', content: {text: [{text: 'Retained draft body'}]} }] });
  const id = created.value.pageId;
  await send('PATCH', `/api/pages/${id}`, { operationKey: createUlid(), expectedRevisionId: created.value.revisionId, properties: {title: 'Edited retained draft'} });
  const before = await send('GET', `/api/pages/${id}`);
  const versions = await send('GET', `/api/revisions/${id}`);
  expect(versions.items.length).toBeGreaterThan(1);
  const input = { operationKey: createUlid(), expectedRevisionId: before.page.revisionId, action: 'trash' };
  expect((await f.request('POST', `/api/archive/${id}`, input, f.b)).status).toBe(404);
  expect((await send('GET', `/api/pages/${id}`)).blocks).toEqual(before.blocks);
  expect((await send('GET', '/api/archive')).items.some((row: any) => row.id === id)).toBe(false);
  expect(await notifications()).toEqual(baseline);

  const discarded = await send('POST', `/api/archive/${id}`, input);
  expect(await send('POST', `/api/archive/${id}`, input)).toEqual(discarded);
  const retained = await env.DB.prepare('SELECT id,author_member_id,lifecycle,working_revision_id,published_revision_id,trashed_at,deleted_at FROM pages WHERE id=?').bind(id).first();
  expect(retained).toMatchObject({id, author_member_id: f.a, lifecycle: 'draft', working_revision_id: before.workingRevisionId, published_revision_id: null, deleted_at: null});
  expect(retained!.trashed_at).toBeTruthy();
  expect((await send('GET', '/api/archive')).items.find((row: any) => row.id === id)).toMatchObject({id, title: before.page.title, trashedAt: retained!.trashed_at});
  expect((await f.request('GET', `/api/pages/${id}`)).status).toBe(404);
  expect((await f.request('GET', `/api/pages/${id}`, undefined, f.b)).status).toBe(404);
  await scheduledDiscovery(env);
  await scheduledDiscovery(env);
  expect(await notifications()).toEqual(baseline);
  expect((await send('GET', '/api/pages', undefined, f.b)).items).toEqual(tree);
  expect((await send('GET', '/api/archive', undefined, f.b)).items.some((row: any) => row.id === id)).toBe(false);

  await send('POST', `/api/archive/${id}`, {...input, operationKey: createUlid(), action: 'restore'});
  const restored = await send('GET', `/api/pages/${id}`);
  expect(restored.page.id).toBe(id);
  expect(restored.page.lifecycle).toBe('draft');
  expect(restored.authorMemberId).toBe(f.a);
  expect(restored.workingRevisionId).toBe(before.workingRevisionId);
  expect(restored.blocks).toEqual(before.blocks);
  expect(await send('GET', `/api/revisions/${id}`)).toEqual(versions);
  // Replaying the original receipt after restore cannot move the draft again.
  expect(await send('POST', `/api/archive/${id}`, input)).toEqual(discarded);
  expect((await send('GET', `/api/pages/${id}`)).page.lifecycle).toBe('draft');
  await scheduledDiscovery(env);
  expect(await notifications()).toEqual(baseline);
  expect((await send('GET', '/api/pages', undefined, f.b)).items).toEqual(tree);
}
