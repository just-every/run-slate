import { test, expect } from 'vitest';
import { fixture, state, env } from './fixture';
import { pageRow } from '../../../src/core/features/pages/repository';

for (const crossContainer of [false, true]) test(`Relocation PAGE-004 LIFE-003 SAVE-005 edit-only same-audience ${crossContainer ? 'cross-container' : 'reparent'} publication confirms once through native API`, async () => {
  const f = await fixture(crossContainer);
  expect((await (await f.request('')).json() as any).permissions).toMatchObject({ level: 'edit', canShare: false });
  const prior = await state(), review = await f.preview();
  expect(await state()).toEqual(prior);
  expect(review.descendants).toHaveLength(2);
  for (const page of review.audience) for (const reader of page.readers) expect(reader.after).toBe(reader.before);
  const input = { ...f.input, previewFingerprint: review.previewFingerprint };
  const response = await f.request('/publish', input);
  expect(response.status, await response.clone().text()).toBe(200);
  const published = await response.json() as any;
  expect(await pageRow(f.owner, f.root.value.pageId)).toMatchObject({ container_id: f.target, parent_page_id: f.parent.value.pageId, tree_position: 'q9-position', lifecycle: 'live', revision_id: published.receipt.revisionId, published_revision_id: published.receipt.revisionId });
  for (const [page, parent] of [[f.child, f.root], [f.grandchild, f.child]]) expect(await pageRow(f.owner, page.value.pageId)).toMatchObject({ container_id: f.target, parent_page_id: parent.value.pageId });
  const after = await state();
  for (const id of [f.parent.value.pageId, f.bystander.value.pageId]) expect(after.pages.find(p => p.id === id)).toEqual(prior.pages.find(p => p.id === id));
  expect(after.page_grants).toEqual(prior.page_grants);
  expect(after.operation_receipts.length - prior.operation_receipts.length).toBe(1);
  expect(after.activity_entries.length - prior.activity_entries.length).toBe(1);
  expect(after.page_revisions.length - prior.page_revisions.length).toBe(3);
  const replay = await f.request('/publish', input);
  expect(replay.status).toBe(200); expect(await replay.json()).toEqual(published); expect(await state()).toEqual(after);
  const conflict = await f.request('/publish', { ...input, label: 'different request' });
  expect(conflict.status).toBe(409); expect(await state()).toEqual(after);
  expect((await (await f.request('')).json() as any).permissions).toMatchObject({ level: 'edit', canShare: false });
  expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM page_revisions WHERE page_id=? AND origin='publish'").bind(f.root.value.pageId).first<{ n: number }>())!.n).toBe(1);
});

test('Relocation LIFE-002 LIFE-003 edit-only explicitly shared draft relocates and publishes to its unchanged audience', async () => {
  const f = await fixture(true, true);
  const { seedPageGrant } = await import('../../e2e/setup/fixtures');
  await seedPageGrant(f.root.value.pageId, { principalKind: 'member', principalId: f.reader.actor.id, level: 'edit' });
  const review = await f.preview();
  for (const page of review.audience) for (const reader of page.readers) expect(reader.after).toBe(reader.before);
  const response = await f.request('/publish', { ...f.input, previewFingerprint: review.previewFingerprint });
  expect(response.status, await response.clone().text()).toBe(200);
  expect(await pageRow(f.owner, f.root.value.pageId)).toMatchObject({ lifecycle: 'live', container_id: f.target });
  expect((await (await f.request('')).json() as any).permissions).toMatchObject({ level: 'edit', canShare: false });
});
