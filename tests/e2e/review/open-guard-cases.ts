import { env } from 'cloudflare:test';
import { expect } from 'vitest';
import { createApi } from '../../../src/core/app/hono';
import type { reviewFixture } from './fixture';

/** Interleave real HTTP mutations at D1's network boundary. Every batch still
 * executes once against real D1; no response or storage result is fabricated. */
export async function openGuardCases(f: Awaited<ReturnType<typeof reviewFixture>>) {
  const api = createApi(), origin = new URL(String(env.APP_URL)).origin;
  let beforeCommit: (() => Promise<void>) | undefined;
  const gated = new Proxy(env.DB, {
    get(target, key) {
      if (key === 'batch') return async (statements: D1PreparedStatement[]) => {
        const mutation = beforeCommit;
        beforeCommit = undefined;
        await mutation?.();
        return target.batch(statements);
      };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const request = async (actor: string, method: string, path: string, input?: unknown, db = env.DB) => {
    const response = await api.request(origin + path, { method, headers: {
      cookie: f.cookies[actor]!, origin, 'content-type': 'application/json',
    }, body: input === undefined ? undefined : JSON.stringify(input) }, { ...env, DB: db });
    return { status: response.status, body: await response.json<any>() };
  };
  const ok = async (method: string, path: string, input?: unknown) => {
    const response = await request('owner', method, path, input);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return response.body;
  };
  const key = () => crypto.randomUUID();
  const created = await ok('POST', '/api/pages', { operationKey: key(), containerId: 'c', title: 'Guard diagnostic handbook' });
  const path = `/api/pages/${created.value.pageId}`, read = () => ok('GET', path);
  const epoch = () => env.DB.prepare('SELECT epoch FROM core_acl_epoch WHERE id=1').first<number>('epoch');
  const open = async (revisionId: string, guard?: string, actor = 'owner') => {
    const operationKey = key();
    const response = await request(actor, 'POST', path + '/open', { operationKey, revisionId }, gated);
    console.info('Open guard response', JSON.stringify({ case: guard ?? 'normal', ...response }));
    if (guard) {
      expect(response.status).toBe(409);
      expect(response.body.code).toBe(guard === 'page_revision' ? 'STALE_REVISION' : 'REVISION_CONFLICT');
      expect.soft(response.body.details?.guard).toBe(guard);
      expect(await env.DB.prepare('SELECT 1 FROM operation_receipts WHERE operation_key=?').bind(operationKey).first()).toBeNull();
    } else {
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.value.revisionId).toBe(revisionId);
      expect(response.body.details).toBeUndefined();
      expect(await request(actor, 'POST', path + '/open', { operationKey, revisionId })).toEqual(response);
    }
    return response.body;
  };
  const change = async () => {
    const document = await read();
    await ok('PATCH', path, { operationKey: key(), expectedRevisionId: document.page.revisionId, properties: { title: key() } });
  };

  const delivered = await read();
  await change();
  await open(delivered.workingRevisionId, 'page_revision');
  expect(await env.DB.prepare('SELECT 1 FROM content_page_opens WHERE page_id=?').bind(created.value.pageId).first()).toBeNull();

  const captured = await read();
  const capturedEpoch = await epoch();
  beforeCommit = async () => { await ok('POST', path + '/lock', { operationKey: key(), expectedRevisionId: captured.page.revisionId }); };
  await open(captured.workingRevisionId, 'revision_tuple');
  expect(await epoch()).toBe(capturedEpoch);

  // Both grant and workspace-policy changes advance the workspace-wide epoch
  // without replacing this page's content revision.
  for (const mutation of [
    async () => { await ok('POST', '/api/sharing', { operationKey: key(), targetKind: 'page', targetId: created.value.pageId, principalKind: 'member', principalId: 'denied', level: 'edit' }); },
    async () => {
      const workspace = await ok('GET', '/api/workspace');
      const { name, mark, guestAccess, publicLinkAccess, anonymousAccess, policies } = workspace;
      await ok('PUT', '/api/workspace', { operationKey: key(), expectedRevisionId: workspace.revisionId, name, mark, description: 'Guard diagnostic workspace', guestAccess, publicLinkAccess, anonymousAccess, policies });
    },
  ]) {
    const document = await read(), expected = await epoch();
    beforeCommit = mutation;
    const rejected = await open(document.workingRevisionId, 'acl_epoch');
    expect(beforeCommit).toBeUndefined();
    const current = await epoch();
    expect(current).toBeGreaterThan(expected!);
    expect.soft(rejected.details?.compared).toEqual({ expected, current });
    expect((await read()).workingRevisionId).toBe(document.workingRevisionId);
  }

  const document = await request('denied', 'GET', path);
  expect(document.status).toBe(200);
  beforeCommit = async () => { await ok('POST', '/api/members/remove', { operationKey: key(), memberId: 'denied' }); };
  await open(document.body.workingRevisionId, 'membership', 'denied');
  expect((await request('denied', 'GET', path)).status).toBe(401);
  expect(await env.DB.prepare('SELECT 1 FROM content_page_opens WHERE page_id=?').bind(created.value.pageId).first()).toBeNull();
  await open((await read()).workingRevisionId);
}
