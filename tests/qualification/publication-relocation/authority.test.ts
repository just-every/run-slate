import { pageRow } from '../../../src/core/features/pages/repository';
import { createPage, updatePage } from '../../../src/core/features/pages/service';
import {resetDeployment} from '../../e2e/setup/reset-deployment';
import { test, expect } from 'vitest';
import { fixture, state, env, key } from './fixture';
import { seedContainerGrant, seedPageGrant } from '../../e2e/setup/fixtures';
import { previewPublication } from '../../../src/core/features/lifecycle/publication-preview';
import { publishPage } from '../../../src/core/features/lifecycle/publication';
import { runContentJobs } from '../../../src/core/features/lifecycle/jobs';

test("Relocation publication review, release and replay preserve current audience authority and atomic subtree state", async () => {
 await scenario("Relocation publication preview and confirmation enforce each current audience boundary", async () => {
  const cases = [
    { name: "Relocation SHARE-002 destination view or edit access widening requires full authority on every affected descendant", run: async () => {
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
} },
    { name: "Relocation SHARE-002 explicit access-setting changes still require full authority even when the member audience is unchanged", run: async () => {
  const f = await fixture();
  const before = await state();
  expect((await f.request('/publish-preview', { ...f.input, generalAccess: { kind: 'restricted' } })).status).toBe(404);
  expect(await state()).toEqual(before);
} },
    { name: "Relocation SHARE-002 retargeted container-general grants cannot disclose a restricted child with edit-only authority", run: async () => {
  const f = await fixture();
  await env.DB.prepare("UPDATE pages SET access_inheritance='restricted' WHERE id=?").bind(f.child.value.pageId).run();
  await seedPageGrant(f.child.value.pageId, { principalKind: 'member', principalId: f.reader.actor.id, level: 'edit' });
  await seedPageGrant(f.child.value.pageId, { principalKind: 'member', principalId: f.owner.actor.id, level: 'full' });
  await seedPageGrant(f.child.value.pageId, { principalKind: 'container', principalId: f.containerId, level: 'view' });
  await env.DB.prepare('INSERT INTO container_members(container_id,member_id,created_at) VALUES(?,?,?)').bind(f.target, f.outsider.actor.id, f.owner.now).run();
  const before = await state();
  expect((await f.request('/publish-preview', f.input)).status).toBe(404);
  expect(await state()).toEqual(before);
} },
    { name: "Relocation WEB-001 anonymous and public-link widening preserves full-publication authority", run: async () => {
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
} },
    { name: "Relocation WEB-001 LIFE-003 the review binds public exposure changes even without an ACL epoch change", run: async () => {
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
} }
  ];
  for (const entry of cases) {
    await resetDeployment();
    try { await entry.run(); }
    catch (cause) { throw new Error(`Case ${entry.name} failed`, { cause }); }
  }

 });
 await resetDeployment();
 await scenario("Relocation LIFE-003 scheduled same-audience relocation preserves reviewed release and edit-only descendant authority", async () => {
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
 await resetDeployment();
 await scenario("Relocation PAGE-004 LIFE-003 SAVE-005 edit-only same-audience reparent and cross-container publication confirms once through native API", async () => {
 let firstCase=true;
 for (const crossContainer of [false, true]){
 if(!firstCase)await resetDeployment();
 firstCase=false;

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
 }

 });
 await resetDeployment();
 await scenario("Relocation LIFE-002 LIFE-003 edit-only explicitly shared draft relocates and publishes to its unchanged audience", async () => {
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
 await resetDeployment();
 await scenario("Relocation publication confirmation refuses stale, revoked and concurrently changed reviewed state", async () => {
  const cases = [
    { name: "Relocation SAVE-003 LIFE-003 stale subtree or destination preview refuses without partial writes", run: async () => {
 let firstCase=true;
 for (const change of ['root', 'child', 'new-descendant', 'destination-reader'] as const){
 if(!firstCase)await resetDeployment();
 firstCase=false;

  const f = await fixture(), review = await f.preview();
  const input = { ...f.input, previewFingerprint: review.previewFingerprint };
  if (change === 'root' || change === 'child') {
    const p = change === 'root' ? f.root : f.child;
    const changed = await updatePage(f.owner, p.value.pageId, { operationKey: key('q9-edit'), expectedRevisionId: p.receipt.revisionId, properties: { title: 'Changed after review' } });
    if (change === 'root') {
      const before = await state(), stale = await f.request('/publish', input);
      expect(stale.status).toBe(409); expect(await stale.json()).toMatchObject({ code: 'REVISION_CONFLICT' }); expect(await state()).toEqual(before);
      input.expectedRevisionId = changed.receipt.revisionId;
    }
  } else if (change === 'new-descendant') {
    await createPage(f.owner, { operationKey: key('q9-new-child'), title: 'New descendant', containerId: f.containerId, parentPageId: f.child.value.pageId });
  } else {
    await seedContainerGrant(f.target, { principalKind: 'member', principalId: f.outsider.actor.id, level: 'view' });
  }
  const before = await state(), response = await f.request('/publish', input);
  expect(response.status).toBe(change === 'destination-reader' ? 404 : 409);
  if (change !== 'destination-reader') expect(await response.json()).toMatchObject({ code: 'PUBLICATION_PREVIEW_CHANGED' });
  expect(await state()).toEqual(before);
 }
} },
    { name: "Relocation SHARE-007 SAVE-005 destination revocation blocks confirmation or replay at either boundary", run: async () => {
 let firstCase=true;
 for (const timing of ['before-confirm', 'after-commit']){
 if(!firstCase)await resetDeployment();
 firstCase=false;

  const f = await fixture(), review = await f.preview();
  const input = { ...f.input, previewFingerprint: review.previewFingerprint };
  if (timing === 'after-commit') expect((await f.request('/publish', input)).status).toBe(200);
  await env.DB.prepare('UPDATE container_grants SET revoked_at=? WHERE id=?').bind(f.owner.now, f.destinationGrantId).run();
  const before = await state(), response = await f.request('/publish', input);
  expect(response.status).toBe(404); expect(await state()).toEqual(before);
 }
} },
    { name: "Relocation ACT-001 concurrent subtree or destination race rolls back receipt, publication and subtree writes", run: async () => {
 let firstCase=true;
 for (const race of ['destination-acl', 'child-revision', 'new-child', 'public-exposure']){
 if(!firstCase)await resetDeployment();
 firstCase=false;

  const f = await fixture(), review = await f.preview();
  // A real D1 trigger injects the conflict after receipt insertion, inside the
  // actual atomic batch. No repository/DB adapter or application path is mocked.
  const change = race === 'destination-acl'
    ? `UPDATE container_grants SET revoked_at='${f.owner.now}' WHERE id='${f.destinationGrantId}';`
    : race === 'child-revision'
      ? `UPDATE pages SET revision_id='q9-raced-revision' WHERE id='${f.child.value.pageId}';`
      : race === 'new-child'
        ? `UPDATE pages SET parent_page_id='${f.root.value.pageId}' WHERE id='${f.bystander.value.pageId}';`
        : `INSERT INTO public_exposures(id,page_id,host,slug,published_at) VALUES('${crypto.randomUUID()}','${f.child.value.pageId}','q9.test.invalid','${key('q9-raced-exposure')}','${f.owner.now}');`;
  const before = await state();
  await env.DB.exec(`CREATE TRIGGER q9_publication_race AFTER INSERT ON operation_receipts WHEN NEW.operation_key='${f.input.operationKey}' BEGIN ${change} END;`);
  try {
    const response = await f.request('/publish', { ...f.input, previewFingerprint: review.previewFingerprint });
    expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(await state()).toEqual(before);
  } finally { await env.DB.exec('DROP TRIGGER q9_publication_race;'); }
 }
} }
  ];
  for (const entry of cases) {
    await resetDeployment();
    try { await entry.run(); }
    catch (cause) { throw new Error(`Case ${entry.name} failed`, { cause }); }
  }

 });
});

async function scenario(name: string, run: () => Promise<void>) {
  try { await run(); }
  catch (cause) { throw new Error(`Scenario ${name} failed`, { cause }); }
}
