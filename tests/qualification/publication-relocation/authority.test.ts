import {resetDeployment} from '../../e2e/setup/reset-deployment';
import { test, expect } from 'vitest';
import { fixture, state, env, key } from './fixture';
import { seedContainerGrant, seedPageGrant } from '../../e2e/setup/fixtures';
import { previewPublication } from '../../../src/core/features/lifecycle/publication-preview';
import { publishPage } from '../../../src/core/features/lifecycle/publication';
import { runContentJobs } from '../../../src/core/features/lifecycle/jobs';

test('Relocation SHARE-002 destination view or edit access widening requires full authority on every affected descendant', async () => {
 let firstCase=true;
 for (const level of ['view', 'edit'] as const){
 if(!firstCase)await resetDeployment();
 firstCase=false;

  const f = await fixture();
  await seedContainerGrant(f.target, { principalKind: 'member', principalId: f.outsider.actor.id, level });
  // A restricted child does not inherit a later full grant on its root.
  await env.DB.prepare("UPDATE pages SET access_inheritance='restricted' WHERE id=?").bind(f.child.value.pageId).run();
  await seedPageGrant(f.child.value.pageId, { principalKind: 'member', principalId: f.reader.actor.id, level: 'edit' });
  await seedPageGrant(f.child.value.pageId, { principalKind: 'member', principalId: f.owner.actor.id, level: 'full' });
  await seedPageGrant(f.child.value.pageId, { principalKind: 'container', principalId: f.containerId, level });
  await env.DB.prepare('INSERT INTO container_members(container_id,member_id,created_at) VALUES(?,?,?)').bind(f.target, f.outsider.actor.id, f.owner.now).run();
  const prior = await state();
  expect((await f.request('/publish-preview', f.input)).status).toBe(404);
  expect((await f.request('/publish', { ...f.input, previewFingerprint: 'unreviewed' })).status).toBe(404);
  expect(await state()).toEqual(prior);
  await seedPageGrant(f.root.value.pageId, { principalKind: 'member', principalId: f.reader.actor.id, level: 'full' });
  const rootOnly = await state();
  expect((await f.request('/publish-preview', f.input)).status).toBe(404);
  expect(await state()).toEqual(rootOnly);
  for (const page of [f.child, f.grandchild]) await seedPageGrant(page.value.pageId, { principalKind: 'member', principalId: f.reader.actor.id, level: 'full' });
  const preview = await f.preview();
  for (const page of preview.audience) expect(page.readers.find(r => r.memberId === f.outsider.actor.id)).toMatchObject({ before: null, after: level });
  const response = await f.request('/publish', { ...f.input, previewFingerprint: preview.previewFingerprint });
  expect(response.status, await response.clone().text()).toBe(200);
 }
});

test('Relocation SHARE-002 explicit access-setting changes still require full authority even when the member audience is unchanged', async () => {
  const f = await fixture();
  const before = await state();
  expect((await f.request('/publish-preview', { ...f.input, generalAccess: { kind: 'restricted' } })).status).toBe(404);
  expect(await state()).toEqual(before);
});

test('Relocation SHARE-002 retargeted container-general grants cannot disclose a restricted child with edit-only authority', async () => {
  const f = await fixture();
  await env.DB.prepare("UPDATE pages SET access_inheritance='restricted' WHERE id=?").bind(f.child.value.pageId).run();
  await seedPageGrant(f.child.value.pageId, { principalKind: 'member', principalId: f.reader.actor.id, level: 'edit' });
  await seedPageGrant(f.child.value.pageId, { principalKind: 'member', principalId: f.owner.actor.id, level: 'full' });
  await seedPageGrant(f.child.value.pageId, { principalKind: 'container', principalId: f.containerId, level: 'view' });
  await env.DB.prepare('INSERT INTO container_members(container_id,member_id,created_at) VALUES(?,?,?)').bind(f.target, f.outsider.actor.id, f.owner.now).run();
  const before = await state();
  expect((await f.request('/publish-preview', f.input)).status).toBe(404);
  expect(await state()).toEqual(before);
});

test('Relocation WEB-001 anonymous and public-link widening preserves full-publication authority', async () => {
 let firstCase=true;
 for (const field of ['anonymous_access', 'public_link_access']){
 if(!firstCase)await resetDeployment();
 firstCase=false;

  const f = await fixture();
  await env.DB.prepare(`UPDATE containers SET ${field}='forbidden' WHERE id=?`).bind(f.containerId).run();
  await env.DB.prepare('INSERT INTO public_exposures(id,page_id,host,slug,published_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), f.child.value.pageId, 'q9.test.invalid', key('q9-public'), f.owner.now).run();
  const before = await state();
  expect((await f.request('/publish-preview', f.input)).status).toBe(404);
  expect(await state()).toEqual(before);
  await seedPageGrant(f.child.value.pageId, { principalKind: 'member', principalId: f.reader.actor.id, level: 'full' });
  const preview = await f.preview();
  expect(preview.publicAccess?.some(change => change.pageId === f.child.value.pageId && change.before === null && change.after === 'view')).toBe(true);
  expect((await f.request('/publish', { ...f.input, previewFingerprint: preview.previewFingerprint })).status).toBe(200);
 }
});

test('Relocation LIFE-003 scheduled same-audience relocation preserves reviewed release and edit-only descendant authority', async () => {
  const f = await fixture();
  // Scheduling a live page has its own full-access requirement; only the root
  // needs that authority when the descendants keep their existing audience.
  await seedPageGrant(f.root.value.pageId, { principalKind: 'member', principalId: f.reader.actor.id, level: 'full' });
  const input = { ...f.input, publishAt: new Date(Date.parse(f.reader.now) + 60000).toISOString() };
  const review = await previewPublication(f.reader, f.root.value.pageId, input);
  const scheduled = await publishPage(f.reader, f.root.value.pageId, { ...input, previewFingerprint: review.previewFingerprint });
  expect(scheduled.value.scheduled).toBe(true);
  expect((await env.DB.prepare('SELECT container_id FROM pages WHERE id=?').bind(f.root.value.pageId).first())!.container_id).toBe(f.containerId);
  await runContentJobs(env, input.publishAt);
  expect(await env.DB.prepare('SELECT state,failure FROM content_schedules WHERE page_id=?').bind(f.root.value.pageId).first()).toMatchObject({ state: 'published', failure: null });
  for (const page of [f.root, f.child, f.grandchild]) expect((await env.DB.prepare('SELECT container_id FROM pages WHERE id=?').bind(page.value.pageId).first())!.container_id).toBe(f.target);
});

test('Relocation WEB-001 LIFE-003 the review binds public exposure changes even without an ACL epoch change', async () => {
  const f = await fixture();
  await env.DB.prepare("UPDATE containers SET anonymous_access='forbidden' WHERE id=?").bind(f.containerId).run();
  await seedPageGrant(f.child.value.pageId, { principalKind: 'member', principalId: f.reader.actor.id, level: 'full' });
  const exposureId = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO public_exposures(id,page_id,host,slug,published_at) VALUES(?,?,?,?,?)').bind(exposureId, f.child.value.pageId, 'q9.test.invalid', key('q9-stale-exposure'), f.owner.now).run();
  const review = await f.preview();
  expect(review.publicAccess).toHaveLength(1);
  const epoch = await env.DB.prepare('SELECT epoch FROM core_acl_epoch WHERE id=1').first();
  await env.DB.prepare('UPDATE public_exposures SET revoked_at=? WHERE id=?').bind(f.owner.now, exposureId).run();
  expect(await env.DB.prepare('SELECT epoch FROM core_acl_epoch WHERE id=1').first()).toEqual(epoch);
  const before = await state(), response = await f.request('/publish', { ...f.input, previewFingerprint: review.previewFingerprint });
  expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ code: 'PUBLICATION_PREVIEW_CHANGED' });
  expect(await state()).toEqual(before);
});
