import {resetDeployment} from '../../e2e/setup/reset-deployment';
import { test, expect } from 'vitest';
import { fixture, state, env, key } from './fixture';
import { createPage, updatePage } from '../../../src/core/features/pages/service';
import { seedContainerGrant } from '../../e2e/setup/fixtures';

test('Relocation SAVE-003 LIFE-003 stale subtree or destination preview refuses without partial writes', async () => {
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
});

test('Relocation SHARE-007 SAVE-005 destination revocation blocks confirmation or replay at either boundary', async () => {
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
});

test('Relocation ACT-001 concurrent subtree or destination race rolls back receipt, publication and subtree writes', async () => {
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
});
