import { env } from 'cloudflare:test';
import { beforeEach, expect } from 'vitest';
import { createApi } from '../../../src/core/app/hono';
import { contract } from '../contract';
import { resetDeployment } from '../setup/reset-deployment';
import { seedWorkspace, seedMember, seedContainer, seedContainerGrant, seedPage, seedPageGrant, sessionFor } from '../setup/fixtures';

beforeEach(resetDeployment);
contract('PAGE-013', 'page and container readership retain daily totals, uniques and author views without exposing private readers or pages', async () => {
  const { workspaceId } = await seedWorkspace();
  const actors: Record<string, { id: string; cookie: string }> = {};
  for (const name of ['owner', 'reader', 'guest', 'denied']) {
    const { memberId } = await seedMember(workspaceId, { role: name === 'owner' ? 'owner' : 'member', email: `${name}@slate.test`, displayName: `${name} Person`, isGuest: name === 'guest', isSetupOwner: name === 'owner' });
    actors[name] = { id: memberId, cookie: await sessionFor(memberId) };
  }
  const { containerId } = await seedContainer(workspaceId, { ownerMemberId: actors.owner.id, visibility: 'private' });
  for (const name of ['owner', 'reader', 'guest']) await seedContainerGrant(containerId, { principalKind: 'member', principalId: actors[name].id, level: name === 'owner' ? 'full' : 'view' });
  const page = await seedPage(containerId, { title: 'Incident response', authorMemberId: actors.owner.id });
  const second = await seedPage(containerId, { title: 'Support handover', authorMemberId: actors.reader.id });
  const draft = await seedPage(containerId, { title: 'Unshared draft', authorMemberId: actors.owner.id, lifecycle: 'draft' });
  const hidden = await seedPage(containerId, { title: 'Restricted plan', authorMemberId: actors.owner.id, accessInheritance: 'restricted' });
  await seedPageGrant(hidden.pageId, { principalKind: 'member', principalId: actors.owner.id, level: 'full' });
  const api = createApi();
  const request = (path: string, actor = 'reader', body?: unknown) => api.request('https://slate.test/api' + path, { method: body ? 'POST' : 'GET', headers: { cookie: actors[actor].cookie, origin: 'https://slate.test', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }, { ...env, SLATE_PROFILE: undefined });
  const json = async (path: string, actor = 'reader', body?: unknown) => { const response = await request(path, actor, body); const value = await response.json<any>(); expect(response.status, JSON.stringify(value)).toBe(200); return value; };
  const open = async (target: typeof page, actor: string, operationKey = crypto.randomUUID()) => json('/analytics/views', actor, { operationKey, pageId: target.pageId });
  const key = crypto.randomUUID(); await open(page, 'owner', key); await open(page, 'owner', key);
  await open(page, 'reader'); await open(page, 'guest'); await open(second, 'reader'); await open(hidden, 'owner'); await open(draft, 'owner');
  // Historical timestamps and contributor identity are test fixtures; every counted view used the public HTTP route.
  await env.DB.prepare('INSERT INTO page_contributors(page_id,member_id,created_at) VALUES(?,?,?)').bind(second.pageId, actors.reader.id, '2026-10-16T12:00:00.000Z').run();
  await env.DB.prepare('UPDATE page_views SET viewed_at=? WHERE page_id=? AND viewer_member_id=?').bind('2026-10-16T12:00:00.000Z', page.pageId, actors.owner.id).run();
  await env.DB.prepare('UPDATE page_views SET viewed_at=? WHERE viewed_at<>?').bind('2026-10-17T15:30:00.000Z', '2026-10-16T12:00:00.000Z').run();
  const stats = await json(`/analytics?pageId=${page.pageId}`);
  expect(stats).toMatchObject({ totalViews: 3, uniqueViewers: 3, ownPageViews: 1, anonymousViews: 0, overTime: [{ day: '2026-10-16', views: 1, ownPageViews: 1, uniqueViewers: 1 }, { day: '2026-10-17', views: 2, ownPageViews: 0, uniqueViewers: 2 }] });
  expect(stats.viewers.map((person: any) => person.id).sort()).toEqual([actors.owner.id, actors.reader.id].sort());
  expect((await json(`/analytics?pageId=${page.pageId}`, 'guest')).viewers.map((person: any) => person.id)).toEqual([actors.guest.id]);
  expect((await json(`/analytics?containerId=${containerId}`))).toMatchObject({ totalViews: 4, uniqueViewers: 3, ownPageViews: 2 });
  expect((await json(`/analytics?containerId=${containerId}`, 'owner')).totalViews).toBe(5);
  expect((await json(`/analytics?pageId=${draft.pageId}`, 'owner')).totalViews).toBe(0);
  expect((await json(`/analytics?pageId=${second.pageId}`)).editors.map((person: any) => person.id)).toContain(actors.reader.id);
  const range = new URLSearchParams({ pageId: page.pageId, from: '2026-10-17T00:00:00+10:00', to: '2026-10-17T23:59:59+10:00' });
  expect((await json(`/analytics?${range}`)).totalViews).toBe(0); // Both boundaries normalize to UTC; the 15:30 UTC views are later.
  range.set('to', '2026-10-18T01:30:00+10:00');
  expect((await json(`/analytics?${range}`)).totalViews).toBe(2);
  expect((await request(`/analytics?pageId=${page.pageId}&from=2026-10-18&to=2026-10-16`)).status).toBe(400);
  expect((await request(`/analytics?pageId=${page.pageId}`, 'denied')).status).toBe(404);
  expect((await request(`/analytics?containerId=${containerId}`, 'denied')).status).toBe(404);
  const grant = await json('/sharing', 'owner', { operationKey: crypto.randomUUID(), targetKind: 'page', targetId: page.pageId, principalKind: 'member', principalId: actors.reader.id, level: 'view' });
  // Removing container access still leaves the direct page grant, then revoking it ends analytics access too.
  await env.DB.prepare('UPDATE container_grants SET revoked_at=? WHERE principal_id=?').bind(new Date().toISOString(), actors.reader.id).run();
  expect((await json(`/analytics?pageId=${page.pageId}`)).totalViews).toBe(3);
  await json('/sharing', 'owner', { operationKey: crypto.randomUUID(), targetKind: 'page', targetId: page.pageId, id: grant.value.id, principalKind: 'member', principalId: actors.reader.id, level: 'view', revoke: true });
  expect((await request(`/analytics?pageId=${page.pageId}`)).status).toBe(404);
});
