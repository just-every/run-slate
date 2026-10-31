import { env } from 'cloudflare:test';
import { expect } from 'vitest';
import type { Hono } from 'hono';
import type { AppEnvironment } from '../../../src/core/app/types';
import { createUlid } from '../../../src/core/shared/ulid';

type Fixture = {
  w: string; a: string; b: string; containerId: string; app: Hono<AppEnvironment>;
  request(method: string, path: string, body?: unknown, actor?: string): Promise<{status: number; data: any}>;
};

/** Native publication requests and fresh anonymous documents over a populated tree. */
export async function publicPageJourney(f: Fixture) {
  const send = async (method: string, path: string, body?: unknown) => {
    const result = await f.request(method, path, body);
    expect(result.status, JSON.stringify(result.data)).toBe(200);
    return result.data;
  };
  const create = async (title: string, parentPageId?: string) => (await send('POST', '/api/pages', {
    operationKey: createUlid(), containerId: f.containerId, parentPageId, title,
    blocks: [{id: createUlid(), blockType: 'paragraph', treePosition: 'a', content: {text: [{text: `${title} body`}]} }],
  })).value.pageId as string;
  const parent = await create('Publication parent');
  const selected = await create('Selected child', parent), hidden = await create('Unselected child', parent);
  const grandchild = await create('Unselected grandchild', selected), independent = await create('Independent reference');
  const slug = new Map([[parent, 'publication-parent'], [selected, 'selected-child'], [hidden, 'unselected-child'],
    [grandchild, 'unselected-grandchild'], [independent, 'independent-reference']]);
  const read = async (id: string) => send('GET', `/api/pages/${id}`);
  const input = async (id: string, children?: string[]) => ({operationKey: createUlid(),
    expectedRevisionId: (await read(id)).page.revisionId, host: 'local.test', slug: slug.get(id),
    ...(children ? {children: await Promise.all(children.map(async pageId => ({pageId, slug: slug.get(pageId), expectedRevisionId: (await read(pageId)).page.revisionId})))} : {}),
  });
  const publish = async (id: string, children?: string[]) => {
    const body = await input(id, children), receipt = await send('POST', `/api/publishing/${id}`, body);
    expect(receipt.value.pageId).toBe(id);
    expect((await send('POST', `/api/publishing/${id}`, body))).toEqual(receipt);
    return receipt;
  };
  const inventory = async (ids: string[]) => {
    const rows = (await env.DB.prepare('SELECT page_id,host,slug,revoked_at FROM public_exposures WHERE page_id IN (SELECT id FROM pages WHERE workspace_id=?) ORDER BY page_id').bind(f.w).all()).results;
    expect(rows).toEqual(ids.sort().map(page_id => ({page_id, host: 'local.test', slug: slug.get(page_id), revoked_at: null})));
  };
  const anonymous = async (id: string, available: boolean) => {
    const response = await f.app.request(`https://local.test/p/${slug.get(id)}`, {}, env);
    expect(response.status).toBe(available ? 200 : 404);
    expect(response.headers.has('set-cookie')).toBe(false);
    const document = await response.text();
    if (!available) {
      expect(document).toContain('This link is no longer available');
      expect(document).not.toContain((await read(id)).page.title);
    }
    return document;
  };
  await publish(parent);
  await inventory([parent]);
  for (const id of [selected, hidden, grandchild]) await anonymous(id, false);
  const later = await create('Later child', parent); slug.set(later, 'later-child');
  await inventory([parent]); await anonymous(later, false);
  const targets = [selected, hidden, grandchild, later, independent];
  const blocks = targets.flatMap((id, index) => [
    {id: createUlid(), blockType: 'paragraph', treePosition: `${index}a`, content: {text: [{text: `Plain ${slug.get(id)}`, link: {href: `/app/pages/${id}`}}]}},
    {id: createUlid(), blockType: 'paragraph', treePosition: `${index}b`, content: {text: [{text: `Absolute ${slug.get(id)}`, link: {href: `https://local.test/app/pages/${id}`}}]}},
    {id: createUlid(), blockType: 'paragraph', treePosition: `${index}c`, content: {text: [{text: 'Private stored label', mention: {kind: 'page', id, label: 'Private stored label'}}]}},
    {id: createUlid(), blockType: 'link-card', treePosition: `${index}d`, content: {url: `/app/pages/${id}`, display: 'card', previewState: 'ready', preview: {title: `Card ${slug.get(id)}`}}},
    {id: createUlid(), blockType: 'link-card', treePosition: `${index}e`, content: {url: `https://local.test/app/pages/${id}`, display: 'card', previewState: 'ready', preview: {title: `Absolute card ${slug.get(id)}`}}},
  ]);
  await send('PUT', `/api/pages/${parent}/blocks`, {operationKey: createUlid(), expectedRevisionId: (await read(parent)).page.revisionId, blocks});
  // Refresh the published revision through the native lifecycle door too.
  await send('POST', `/api/pages/${parent}/publish`, {operationKey: createUlid(), expectedRevisionId: (await read(parent)).page.revisionId});
  const check = async (published: string[]) => {
    await inventory([parent, ...published]);
    const document = await anonymous(parent, true);
    expect(document).not.toContain('/app/pages/');
    expect(document).not.toContain('Private stored label');
    for (const id of targets) {
      const anchors = document.match(new RegExp(`href="/p/${slug.get(id)}"`, 'g')) ?? [];
      expect(anchors.length, `Reference forms for ${slug.get(id)}`).toBe(published.includes(id) ? 5 : 0);
      expect(document).toContain(`Plain ${slug.get(id)}`);
      expect(document).toContain(`Card ${slug.get(id)}`);
      await anonymous(id, published.includes(id));
    }
  };
  await check([]);
  // A read-only member cannot disclose either the parent or an included child.
  await env.DB.prepare("UPDATE container_grants SET level='view' WHERE container_id=? AND principal_kind='workspace'").bind(f.containerId).run();
  expect((await f.request('POST', `/api/publishing/${parent}`, await input(parent, [hidden]), f.b)).status).toBe(404);
  await check([]);
  // A publisher who controls the parent cannot smuggle a separately restricted child.
  const otherContainer = await f.request('POST', '/api/containers', {operationKey:createUlid(), name:'Other publisher', visibility:'private'}, f.b);
  expect(otherContainer.status).toBe(200);
  const otherPage = await f.request('POST', '/api/pages', {operationKey:createUlid(), containerId:otherContainer.data.value.id, title:'Other publisher secret'}, f.b);
  expect(otherPage.status).toBe(200);
  expect((await f.request('POST', `/api/publishing/${parent}`, {...await input(parent), children:[{pageId:otherPage.data.value.pageId, slug:'forbidden-child', expectedRevisionId:otherPage.data.value.revisionId}]})).status).toBe(404);
  await check([]);
  await publish(parent, [selected]);
  await check([selected]);
  await publish(independent);
  await check([selected, independent]);
  await publish(later);
  await check([selected, independent, later]);
}
