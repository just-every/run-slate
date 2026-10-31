import { expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { Hono } from 'hono';
import type { AppEnvironment } from '../../../src/core/app/types';
import { createUlid } from '../../../src/core/shared/ulid';

/** Published bytes and anonymous accounting through the native HTTP doors. */
export async function anonymousReadJourney(f: {
  w: string; a: string; b: string; containerId: string; app: Hono<AppEnvironment>;
  request(method: string, path: string, body?: unknown, actor?: string): Promise<{status: number; data: any}>;
}) {
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO workspace_policies VALUES (?,?,?)')
    .bind(f.w, JSON.stringify({'page.lifecycle.v1': 'draft-then-publish'}), now).run();
  for (const [id, name] of [[f.a, 'Published Writer'], [f.b, 'Private Operator']])
    await env.DB.prepare('UPDATE members SET display_name=? WHERE id=?').bind(name, id).run();
  const mutate = async (method: string, route: string, data: Record<string, unknown>, actor = f.a) => {
    const response = await f.request(method, route, {operationKey: createUlid(), ...data}, actor);
    expect(response.status, JSON.stringify(response.data)).toBe(200);
    return response.data.value;
  };
  const paragraph = (text: any[], treePosition = '1') => ({id: createUlid(), blockType: 'paragraph', treePosition, content: {text}});
  const create = (title: string, blocks: any[], parentPageId?: string) => mutate('POST', '/api/pages', {containerId: f.containerId, title, blocks, parentPageId});
  const publish = (pageId: string, revisionId: string, extra = {}) => mutate('POST', `/api/pages/${pageId}/publish`, {expectedRevisionId: revisionId, ...extra});
  const expose = (pageId: string, revisionId: string, slug: string, extra = {}) => mutate('POST', `/api/publishing/${pageId}`, {expectedRevisionId: revisionId, host: 'local.test', slug, ...extra});
  const parent = await create('Public handbook', [paragraph([{text: 'Public reference body'}])]);
  const parentPublished = await publish(parent.pageId, parent.revisionId);
  await expose(parent.pageId, parentPublished.revisionId, 'public-handbook');
  await mutate('PATCH', `/api/pages/${parent.pageId}`, {expectedRevisionId: parentPublished.revisionId, properties: {title: 'Unpublished handbook title'}});
  const privatePage = await create('Confidential neighbouring page', [paragraph([{text: 'Confidential neighbouring body'}])]);
  const body = paragraph([{text: 'Published launch instructions. '},
    {text: 'Public reference', link: {href: `/app/pages/${parent.pageId}`}},
    {text: ' Private reference', link: {href: `/app/pages/${privatePage.pageId}`}},
    {text: 'Confidential neighbouring page', mention: {kind: 'page', id: privatePage.pageId, label: 'Confidential neighbouring page'}},
    {text: 'Unpublished handbook title', marks: ['underline'], mention: {kind: 'page', id: parent.pageId, label: 'Unpublished handbook title'}}]);
  const page = await create('Published launch guide', [body], parent.pageId);
  const published = await publish(page.pageId, page.revisionId, {publishAsMemberId: f.a});
  await expose(page.pageId, published.revisionId, 'launch-guide', {
    headerControls: ['search', 'breadcrumbs', 'duplicate'], duplicateAsTemplate: true,
  });
  const snapshot = await f.request('GET', `/api/revisions/${page.pageId}/${published.revisionId}`);
  expect(snapshot.status).toBe(200);
  expect(snapshot.data.properties.byline).toBe('Published Writer');
  await mutate('POST', `/api/comments/page/${page.pageId}`, {body: [{text: 'Internal operator discussion'}]}, f.b);
  await mutate('PATCH', `/api/pages/${page.pageId}`, {expectedRevisionId: published.revisionId, properties: {title: 'Unpublished launch title'}}, f.b);
  const current = (await f.request('GET', `/api/pages/${page.pageId}`)).data;
  await mutate('PATCH', `/api/pages/${page.pageId}/blocks/${body.id}`, {
    expectedRevisionId: current.blocks[0].revisionId, content: {text: [{text: 'Unpublished launch body'}]},
  }, f.b);
  const working = (await f.request('GET', `/api/pages/${page.pageId}`)).data;
  expect(working.page.title).toBe('Unpublished launch title');
  expect(working.blocks[0].content.text[0].text).toBe('Unpublished launch body');
  expect(working.publishedRevisionId).toBe(published.revisionId);
  expect(working.workingRevisionId).not.toBe(published.revisionId);
  expect((await f.request('GET', `/api/comments/page/${page.pageId}`)).data.threads).toHaveLength(1);
  const metrics = async () => {
    const response = await f.request('GET', `/api/analytics?pageId=${page.pageId}`);
    expect(response.status, JSON.stringify(response.data)).toBe(200);
    return response.data;
  };
  const before = await metrics();
  for (let visit = 1; visit <= 2; visit++) {
    const response = await f.app.request('https://local.test/p/launch-guide', {
      headers: {'user-agent': `synthetic-slate-${300 + visit}`, referer: 'https://visitor.invalid/'},
    }, env);
    expect(response.status).toBe(200);
    expect(response.headers.has('set-cookie')).toBe(false);
    const html = await response.text();
    expect(html).toContain('<h1 class="page-title">Published launch guide</h1>');
    expect(html).toContain('Published launch instructions.');
    expect(html).toContain('<p class="page-byline">Published Writer</p>');
    expect(html).toContain('href="/p/public-handbook"');
    expect(html).toContain(' Private reference');
    expect(html).toContain('Restricted page');
    expect(html).toContain('aria-label="Published ancestors"');
    expect(html).toContain('Search published pages');
    expect(html).toContain('Duplicate this page');
    for (const secret of ['Unpublished launch title', 'Unpublished launch body', 'Internal operator discussion',
      'Private Operator', 'Confidential neighbouring page', 'Confidential neighbouring body', 'Unpublished handbook title', f.a, f.b])
      expect(html).not.toContain(secret);
    expect(html).not.toMatch(/href="\/app|contenteditable|data-testid="member-name"|class="app-navigation"/);
    const after = await metrics();
    expect(after.anonymousViews).toBe(before.anonymousViews + visit);
    expect(after.totalViews).toBe(before.totalViews + visit);
    expect(after.uniqueViewers).toBe(before.uniqueViewers);
    expect(after.viewers).toEqual(before.viewers);
  }
  const rows = (await env.DB.prepare('SELECT page_id,viewer_member_id,viewer_kind,is_own_page FROM page_views WHERE page_id=?')
    .bind(page.pageId).all()).results;
  expect(rows).toEqual([1, 2].map(() => ({page_id: page.pageId, viewer_member_id: null, viewer_kind: 'anonymous', is_own_page: 0})));
  for (const route of [`/api/pages/${page.pageId}`, `/api/comments/page/${page.pageId}`, `/api/revisions/${page.pageId}/${published.revisionId}`])
    expect((await f.request('GET', route, undefined, 'missing')).status).toBe(401);
  const unavailable = await f.app.request('https://local.test/p/confidential-neighbour', {}, env);
  expect(unavailable.status).toBe(404);
  expect(await unavailable.text()).not.toContain('Confidential neighbouring');
  await expose(page.pageId, working.page.revisionId, 'launch-guide', {revoke: true});
  const revoked = await f.app.request('https://local.test/p/launch-guide', {}, env);
  expect(revoked.status).toBe(404);
  expect(await revoked.text()).not.toMatch(/Published launch|Unpublished launch|Published Writer/);
  expect((await metrics()).totalViews).toBe(before.totalViews + 2);
  const retained = (await f.request('GET', `/api/revisions/${page.pageId}/${published.revisionId}`)).data;
  expect(retained.newerRevisionExists).toBe(true);
  for (const field of ['id', 'createdAt', 'properties', 'blocks']) expect(retained[field]).toEqual(snapshot.data[field]);
}
