import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { call, grant, ok, restrictedPage } from './two-people-support.mjs';

/** REV-006: explicit deletion retains numbered attribution and protects live content. */
export async function revisionDeletionJourney(state, people) {
  const { origin } = state, { alice, bob, record, shot } = people;
  const settings = await ok(alice.context, origin, 'GET', '/api/workspace');
  const profile = async version => {
    const current = await ok(alice.context, origin, 'GET', '/api/workspace');
    await ok(alice.context, origin, 'PUT', '/api/workspace', {
      operationKey: randomUUID(), expectedRevisionId: current.revisionId,
      name: current.name, mark: current.mark, description: current.description,
      guestAccess: current.guestAccess, publicLinkAccess: current.publicLinkAccess, anonymousAccess: current.anonymousAccess,
      policies: { ...current.policies, 'page.lifecycle.v1': 'draft-then-publish', 'page.version.v1': version },
    });
  };
  await profile('labelled');
  const { pageId, blockIds: [blockId] } = await restrictedPage({ context: alice.context, origin }, 'Revision deletion runbook', ['Retained first version.']);
  const read = () => ok(alice.context, origin, 'GET', `/api/pages/${pageId}`);
  const history = async () => (await ok(alice.context, origin, 'GET', `/api/revisions/${pageId}`)).items;
  const activity = async () => (await ok(alice.context, origin, 'GET', '/api/activity?limit=100')).items.filter(item => item.action === 'versions.delete' && item.target.id === pageId);
  const publish = async label => {
    const current = await read();
    return ok(alice.context, origin, 'POST', `/api/pages/${pageId}/publish`, { operationKey: randomUUID(), expectedRevisionId: current.page.revisionId, label });
  };
  const edit = async text => {
    const current = await read();
    await ok(alice.context, origin, 'PATCH', `/api/pages/${pageId}/blocks/${blockId}`, {
      operationKey: randomUUID(), expectedRevisionId: current.blocks[0].revisionId, content: { text: [{ text }] },
    });
  };
  const first = await publish('First retained version');
  const removedText = 'Intermediate content chosen for deletion.';
  await edit(removedText);
  const intermediate = (await publish('Intermediate version')).value.revisionId;
  await edit('Retained published version.');
  const published = (await publish('Published retained version')).value.revisionId;
  await edit('Retained current working version.');
  await grant(alice.context, origin, pageId, bob.id, 'edit');
  const current = await read(), beforeHistory = await history();
  const selected = await ok(alice.context, origin, 'GET', `/api/revisions/${pageId}/${intermediate}`);
  assert.equal(selected.blocks[0].content.text[0].text, removedText, 'The selected intermediate revision has actual content.');
  assert.equal(beforeHistory.find(item => item.id === intermediate).ordinal, 2);
  assert.notEqual(current.workingRevisionId, published, 'Current working and published versions are distinct protected revisions.');

  const unchanged = async () => {
    assert.deepEqual(await read(), current, 'A refused deletion changes no current page state.');
    assert.deepEqual(await history(), beforeHistory, 'A refused deletion changes no retained revision.');
    assert.deepEqual(await activity(), [], 'A refused deletion writes no activity.');
  };
  let result = await call(bob.context, origin, 'DELETE', `/api/revisions/${pageId}/${intermediate}`, { operationKey: randomUUID() });
  assert.ok([403, 404].includes(result.status), 'An edit-only member cannot delete a version.');
  await unchanged();
  const bobGrant = (await ok(alice.context, origin, 'GET', `/api/sharing/pages/${pageId}`)).items.find(item => item.principalId === bob.id);
  await grant(alice.context, origin, pageId, bob.id, 'full', { id: bobGrant.id });
  assert.equal((await ok(bob.context, origin, 'GET', `/api/pages/${pageId}`)).permissions.level, 'full');
  const historyUrl = revision => `${origin}/app/pages/${pageId}?detail=history&revision=${revision}`;
  const deleteButton = () => bob.page.getByRole('button', { name: 'Delete this intermediate revision', exact: true });
  for (const revision of [current.workingRevisionId, published]) {
    await bob.page.goto(historyUrl(revision), { waitUntil: 'networkidle' });
    await expect(bob.page.locator('.revision-preview')).toBeVisible();
    await expect(deleteButton()).toHaveCount(0);
    result = await call(bob.context, origin, 'DELETE', `/api/revisions/${pageId}/${revision}`, { operationKey: randomUUID() });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'CURRENT_REVISION');
    await unchanged();
  }
  await profile('autosnapshot');
  await bob.page.goto(historyUrl(intermediate), { waitUntil: 'networkidle' });
  await expect(bob.page.locator('.revision-preview')).toContainText(removedText);
  await expect(deleteButton()).toHaveCount(0);
  result = await call(bob.context, origin, 'DELETE', `/api/revisions/${pageId}/${intermediate}`, { operationKey: randomUUID() });
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'POLICY_RESTRICTED');
  await unchanged();
  await profile('labelled');
  await bob.page.reload({ waitUntil: 'networkidle' });
  await expect(deleteButton()).toBeVisible();
  await deleteButton().click();
  const dialog = bob.page.getByRole('dialog', { name: 'Delete this intermediate revision?', exact: true });
  const response = bob.page.waitForResponse(item => item.request().method() === 'DELETE' && item.url().endsWith(`/api/revisions/${pageId}/${intermediate}`));
  await dialog.getByRole('button', { name: 'Delete revision', exact: true }).click();
  const deletion = await response;
  assert.equal(deletion.status(), 200);
  const deletionReceipt = await deletion.json(), deletionInput = deletion.request().postDataJSON();
  await expect(dialog).toBeHidden();
  await bob.page.reload({ waitUntil: 'networkidle' });
  await expect(bob.page.getByText('This exact revision has been deleted. Its content is unavailable.', { exact: true })).toBeVisible();
  await expect(bob.page.locator('body')).not.toContainText(removedText);
  const tombstone = await ok(bob.context, origin, 'GET', `/api/revisions/${pageId}/${intermediate}`);
  assert.equal(tombstone.deleted, true);
  assert.equal(tombstone.ordinal, 2);
  assert.ok(tombstone.deletedAt);
  assert.equal('blocks' in tombstone, false);
  assert.equal('properties' in tombstone, false);
  const afterHistory = await history(), deleted = afterHistory.find(item => item.id === intermediate);
  assert.equal(deleted.ordinal, 2);
  assert.equal(deleted.deletedByMemberId, bob.id);
  assert.equal(deleted.deletedByDisplayName, bob.name);
  assert.equal(deleted.deletedAt, tombstone.deletedAt);
  assert.deepEqual(afterHistory.filter(item => item.id !== intermediate), beforeHistory.filter(item => item.id !== intermediate), 'Every other retained revision is unchanged.');
  assert.deepEqual(await read(), current, 'Deletion changes neither current content nor the published revision.');
  assert.equal((await ok(alice.context, origin, 'GET', `/api/revisions/${pageId}/${first.value.revisionId}`)).blocks[0].content.text[0].text, 'Retained first version.');
  assert.equal((await ok(alice.context, origin, 'GET', `/api/revisions/${pageId}/${published}`)).blocks[0].content.text[0].text, 'Retained published version.');
  const row = bob.page.locator('.history-list li').filter({ hasText: 'Version 2' });
  await expect(row).toContainText(`Deleted by ${bob.name}`);
  await expect(row.locator(`time[datetime="${tombstone.deletedAt}"]`)).toBeVisible();
  await shot('bob', 'numbered deleted revision with actor and time');
  assert.deepEqual(await ok(bob.context, origin, 'DELETE', `/api/revisions/${pageId}/${intermediate}`, deletionInput), deletionReceipt);
  assert.deepEqual(await history(), afterHistory);
  assert.equal((await activity()).length, 1, 'Deletion retry records exactly one destructive action.');
  result = await call(bob.context, origin, 'POST', `/api/revisions/${pageId}/${intermediate}/restore`, { operationKey: randomUUID(), expectedRevisionId: current.page.revisionId });
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'DELETED_REVISION');
  await grant(alice.context, origin, pageId, bob.id, 'edit', { id: bobGrant.id });
  result = await call(bob.context, origin, 'DELETE', `/api/revisions/${pageId}/${intermediate}`, deletionInput);
  assert.ok([403, 404].includes(result.status), 'Reduced authority cannot replay the destructive receipt.');
  assert.deepEqual(await read(), current);
  assert.deepEqual(await history(), afterHistory);
  assert.equal((await activity()).length, 1);
  record('revisionDeletion', { deletedRevision: intermediate, ordinal: 2, deletedBy: bob.name, deletedAt: tombstone.deletedAt, workingRevision: current.workingRevisionId, publishedRevision: published });
  // Keep this shared caller's previous lifecycle and version choices.
  const workspace = await ok(alice.context, origin, 'GET', '/api/workspace');
  await ok(alice.context, origin, 'PUT', '/api/workspace', {
    operationKey: randomUUID(), expectedRevisionId: workspace.revisionId,
    name: workspace.name, mark: workspace.mark, description: workspace.description,
    guestAccess: workspace.guestAccess, publicLinkAccess: workspace.publicLinkAccess, anonymousAccess: workspace.anonymousAccess,
    policies: settings.policies,
  });
}
