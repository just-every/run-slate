import { env } from 'cloudflare:test';
import { beforeEach, expect } from 'vitest';
import { decodeArchive } from '../../../src/core/features/portability/archive';
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

contract('ADMIN-004', 'owner reports export every report as CSV and container owners see only their readable container figures', async () => {
  const { workspaceId } = await seedWorkspace();
  const actors: Record<string, { id: string; cookie: string }> = {};
  for (const name of ['owner', 'steward', 'reader', 'guest']) {
    const { memberId } = await seedMember(workspaceId, { role: name === 'owner' ? 'owner' : 'member', email: `${name}@slate.test`, displayName: `${name} Person`, isGuest: name === 'guest', isSetupOwner: name === 'owner' });
    actors[name] = { id: memberId, cookie: await sessionFor(memberId) };
  }
  const own = await seedContainer(workspaceId, { ownerMemberId: actors.steward.id, visibility: 'private', name: 'Support' });
  const other = await seedContainer(workspaceId, { ownerMemberId: actors.owner.id, visibility: 'private', name: 'Finance' });
  for (const c of [own, other]) for (const name of ['owner', 'steward', 'reader', 'guest']) await seedContainerGrant(c.containerId, { principalKind: 'member', principalId: actors[name].id, level: name === 'guest' ? 'view' : 'full' });
  const old = '2000-01-02T12:00:00.000Z', recent = new Date().toISOString();
  const makePage = async (containerId: string, title: string, opts: { ownerMemberId?: string; lifecycle?: 'draft'; accessInheritance?: 'restricted'; date?: string } = {}) => {
    const p = await seedPage(containerId, { title, authorMemberId: actors.owner.id, ownerMemberId: opts.ownerMemberId, lifecycle: opts.lifecycle, accessInheritance: opts.accessInheritance });
    await env.DB.prepare('UPDATE pages SET created_at=?,updated_at=? WHERE id=?').bind(opts.date ?? old, opts.date ?? old, p.pageId).run();
    await env.DB.prepare("INSERT INTO page_revisions(id,page_id,author_member_id,origin,content_hash,body_json,properties_json,created_at) VALUES(?,?,?,'publish',?,'[]',?,?)")
      .bind(p.workingRevisionId, p.pageId, actors.owner.id, crypto.randomUUID(), JSON.stringify({ title, labels: [] }), opts.date ?? old).run();
    return p;
  };
  const stale = await makePage(own.containerId, '=SUM(1,2)\nRunbook');
  const lapsed = await makePage(own.containerId, 'Lapsed review', { ownerMemberId: actors.steward.id });
  const verified = await makePage(own.containerId, 'Current review', { ownerMemberId: actors.owner.id });
  const fresh = await makePage(own.containerId, 'Fresh edit', { date: recent });
  const secret = await makePage(own.containerId, 'Restricted payroll', { accessInheritance: 'restricted' });
  await seedPageGrant(secret.pageId, { principalKind: 'member', principalId: actors.owner.id, level: 'full' });
  const foreign = await makePage(other.containerId, 'Finance only', { ownerMemberId: actors.owner.id });
  await makePage(own.containerId, 'Draft excluded', { lifecycle: 'draft' });
  const removed = await makePage(own.containerId, 'Deleted excluded');
  await env.DB.prepare('UPDATE pages SET deleted_at=? WHERE id=?').bind(recent, removed.pageId).run();
  for (const [p, expiry, at] of [[lapsed, old, old], [verified, '2099-01-01T00:00:00.000Z', recent]] as const) {
    await env.DB.prepare("UPDATE pages SET status_key='verified' WHERE id=?").bind(p.pageId).run();
    await env.DB.prepare("INSERT INTO page_verifications(id,page_id,revision_id,status_key,owner_member_id,verified_by_member_id,expires_at,created_at) VALUES(?,?,?,'verified',?,?,?,?)")
      .bind(crypto.randomUUID(), p.pageId, p.workingRevisionId, p.pageId === lapsed.pageId ? actors.steward.id : actors.owner.id, actors.owner.id, expiry, at).run();
  }
  const api = createApi();
  const request = (path: string, actor = 'owner', body?: unknown) => api.request(`https://slate.test/api${path}`, { method: body ? 'POST' : 'GET', headers: { cookie: actors[actor].cookie, origin: 'https://slate.test', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }, { ...env, SLATE_PROFILE: undefined });
  const json = async (path: string, actor = 'owner', body?: unknown) => { const r = await request(path, actor, body); const value = await r.json<any>(); expect(r.status, JSON.stringify(value)).toBe(200); return value; };
  for (const [p, actor] of [[stale, 'owner'], [stale, 'reader'], [stale, 'reader'], [lapsed, 'reader'], [verified, 'reader'], [foreign, 'reader'], [secret, 'owner']] as const) await json('/analytics/views', actor, { pageId: p.pageId, operationKey: crypto.randomUUID() });
  await env.DB.prepare('UPDATE page_views SET viewed_at=?').bind(recent).run();
  const search = (query: string, containerId?: string, actor = 'reader') => json(`/search?${new URLSearchParams({ q: query, ...(containerId ? { containerId } : {}) })}`, actor);
  expect((await search('unfindable-support-term', own.containerId)).total).toBe(0);
  await search('unfindable-support-term', own.containerId);
  await search('unfindable-finance-term', other.containerId);
  await search('unfindable-workspace-term');
  await search(''); // Browsing is never a failed search.
  actors.owner.cookie=await sessionFor(actors.owner.id,{freshProof:true});
  const exported=await json('/exports/workspace','owner',{operationKey:crypto.randomUUID()});
  expect(exported.state).toBe('completed');
  const download=await request(`/exports/${exported.id}/download`);
  expect(download.status).toBe(200);
  const archive=await decodeArchive(new Uint8Array(await download.arrayBuffer()));
  expect(archive.manifest.tables.analytics_no_result_searches).toEqual(expect.arrayContaining([expect.objectContaining({query:'unfindable-support-term',searches:2})]));
  const scopes = await json('/analytics/report-scopes', 'steward');
  expect(scopes).toEqual({ workspace: false, containers: [{ id: own.containerId, name: 'Support' }] });
  const report = (kind: string, actor = 'owner', extra: Record<string, string> = {}) => json(`/analytics/reports?${new URLSearchParams({ report: kind, ...extra })}`, actor);
  const views = await report('views');
  expect(views.rows.find((r: any) => r.pageId === stale.pageId)).toMatchObject({ views: 3, uniqueViewers: 2 });
  expect(views.rows.find((r: any) => r.pageId === foreign.pageId)).toMatchObject({ views: 1, uniqueViewers: 1 });
  const staleRows = (await report('stale', 'owner', { staleDays: '30' })).rows;
  expect(staleRows.map((r: any) => r.pageId).sort()).toEqual([stale.pageId, lapsed.pageId, secret.pageId, foreign.pageId].sort());
  expect((await report('unowned')).rows.map((r: any) => r.pageId).sort()).toEqual([stale.pageId, fresh.pageId, secret.pageId].sort());
  expect((await report('lapsed-verifications')).rows).toEqual([{ pageId: lapsed.pageId, title: 'Lapsed review', containerId: own.containerId, container: 'Support', owner: 'steward Person', expiresAt: old }]);
  expect((await report('most-viewed-unverified')).rows.map((r: any) => r.pageId)).toEqual([stale.pageId, foreign.pageId, lapsed.pageId, secret.pageId]);
  const failed = await report('no-results');
  expect(failed.rows.map((r: any) => [r.query, r.searches])).toEqual([['unfindable-support-term', 2], ['unfindable-finance-term', 1], ['unfindable-workspace-term', 1]]);
  expect((await report('container-growth')).rows).toEqual(expect.arrayContaining([
    { containerId: own.containerId, container: 'Support', day: '2000-01-02', pagesCreated: 4, totalPages: 4 },
    { containerId: own.containerId, container: 'Support', day: recent.slice(0, 10), pagesCreated: 1, totalPages: 5 },
    { containerId: other.containerId, container: 'Finance', day: '2000-01-02', pagesCreated: 1, totalPages: 1 },
  ]));
  const kinds = ['views', 'stale', 'unowned', 'lapsed-verifications', 'most-viewed-unverified', 'no-results', 'container-growth'];
  // A small CSV parser checks every exported cell, including commas/newlines/quotes.
  const parseCsv = (csv: string) => [...csv.matchAll(/"((?:[^"]|"")*)"([,\r\n]*)/g)].reduce<string[][]>((rows, match) => {
    rows.at(-1)!.push(match[1].replaceAll('""', '"'));
    if (match[2].includes('\n')) rows.push([]);
    return rows;
  }, [[]]).filter(row => row.length);
  for (const kind of kinds) {
    const data = await report(kind), scoped = await report(kind, 'steward');
    const serialized = JSON.stringify(scoped.rows);
    expect(serialized).not.toContain('Finance');
    expect(serialized).not.toContain('Restricted payroll');
    expect(serialized).not.toContain('unfindable-workspace-term');
    expect(serialized).not.toContain(actors.reader.id);
    expect(serialized).not.toContain('viewer_member_id');
    for (const actor of ['owner', 'steward']) {
      const response = await request(`/analytics/reports?report=${kind}&format=csv`, actor);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/csv');
      const source = actor === 'owner' ? data : scoped;
      const escape = (v: unknown) => typeof v === 'string' && /^[\s\u0000-\u001f]*[=+@-]/u.test(v) ? `'${v}` : v === null || v === undefined ? '' : String(v);
      expect(parseCsv(await response.text())).toEqual([source.columns.map((c: any) => c.label), ...source.rows.map((row: any) => source.columns.map((c: any) => escape(row[c.key])))]);
    }
    expect((await request(`/analytics/reports?report=${kind}&containerId=${other.containerId}`, 'steward')).status).toBe(404);
    expect((await request(`/analytics/reports?report=${kind}&format=csv&containerId=${other.containerId}`, 'steward')).status).toBe(404);
    for (const actor of ['reader', 'guest']) expect((await request(`/analytics/reports?report=${kind}`, actor)).status).toBe(403);
  }
  expect((await report('views', 'owner', { from: '2000-01-01', to: '2000-01-03' })).rows.every((r: any) => r.views === 0)).toBe(true);
  expect((await report('no-results', 'owner', { to: '2000-01-03' })).rows).toEqual([]);
  expect((await report('container-growth', 'steward', { from: recent.slice(0, 10) })).rows).toEqual([{ containerId: own.containerId, container: 'Support', day: recent.slice(0, 10), pagesCreated: 1, totalPages: 4 }]);
  expect((await request('/analytics/reports?report=stale&staleDays=0')).status).toBe(400);
  expect((await request('/analytics/reports?report=views&from=2099-01-01&to=2000-01-01')).status).toBe(400);
  await env.DB.prepare('DELETE FROM container_owners WHERE container_id=? AND member_id=?').bind(own.containerId, actors.steward.id).run();
  expect((await request('/analytics/reports?report=views', 'steward')).status).toBe(403);
});
