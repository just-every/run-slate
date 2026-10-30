import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { accessible } from './browser-evidence.mjs';
import { call, grant, ok, restrictedPage } from './two-people-support.mjs';

/** Native labelled history: a full member deletes one version, retaining the rest. */
export async function versionDeletionJourney(state, people) {
  const { origin } = state, { alice, bob, shot, record } = people;
  const profile = async changes => {
    const workspace = await ok(alice.context, origin, 'GET', '/api/workspace');
    const { name, mark, description, guestAccess, publicLinkAccess, anonymousAccess } = workspace;
    await ok(alice.context, origin, 'PUT', '/api/workspace', {
      operationKey: randomUUID(), expectedRevisionId: workspace.revisionId,
      name, mark, description, guestAccess, publicLinkAccess, anonymousAccess,
      policies: { ...workspace.policies, ...changes },
    });
  };
  const originalPolicies = (await ok(alice.context, origin, 'GET', '/api/workspace')).policies;
  try {
    await profile({ 'page.lifecycle.v1': 'draft-then-publish', 'page.version.v1': 'labelled' });
    const { pageId, blockIds: [blockId] } = await restrictedPage(
      { context: alice.context, origin }, 'Version deletion runbook', ['Keep the first publication.'],
    );
    await grant(alice.context, origin, pageId, bob.id, 'edit');
    const read = () => ok(alice.context, origin, 'GET', `/api/pages/${pageId}`);
    const history = async () => (await ok(alice.context, origin, 'GET', `/api/revisions/${pageId}`)).items;
    const snapshot = id => ok(alice.context, origin, 'GET', `/api/revisions/${pageId}/${id}`);
    const activity = async () => (await ok(alice.context, origin, 'GET', '/api/activity?action=versions.delete&limit=100')).items.filter(item => item.target.id === pageId);
    const write = async text => {
      const document = await read();
      await ok(alice.context, origin, 'PATCH', `/api/pages/${pageId}/blocks/${blockId}`, {
        operationKey: randomUUID(), expectedRevisionId: document.blocks[0].revisionId,
        content: { text: [{ text }] },
      });
    };
    // Publish through the actual review and confirmation controls, keeping each label.
    const publish = async label => {
      await alice.page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
      await alice.page.getByRole('button', { name: 'More', exact: true }).click();
      await alice.page.getByRole('menuitem', { name: 'Publish workspace revision', exact: true }).click();
      const dialog = alice.page.getByRole('dialog');
      await dialog.getByLabel('Version label', { exact: true }).fill(label);
      await dialog.getByRole('button', { name: 'Review publication', exact: true }).click();
      await expect(dialog.getByRole('region', { name: 'Reviewed publication', exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Publish workspace revision', exact: true }).click();
      await expect(dialog).toBeHidden();
      return (await read()).publishedRevisionId;
    };
    const first = await publish('First publication');
    await write('Remove only this intermediate content.');
    const intermediate = await publish('Intermediate publication');
    await write('Keep the current published content.');
    const published = await publish('Latest publication');
    await write('Keep the newer unpublished working content.');
    const working = (await read()).workingRevisionId;
    assert.notEqual(working, published, 'Current and published revisions are distinct.');
    const before = await history(), documentBefore = await read();
    const snapshotsBefore = new Map(await Promise.all(before.map(async item => [item.id, await snapshot(item.id)])));
    const activityBefore = await activity();
    const citation = id => `${origin}/app/pages/${pageId}?detail=history&revision=${id}`;
    const deleteControl = page => page.getByRole('button', { name: 'Delete this intermediate revision', exact: true });
    const unchanged = async () => {
      assert.deepEqual(await history(), before, 'Refused deletion preserves the entire history.');
      assert.deepEqual(await read(), documentBefore, 'Refused deletion preserves current and published state.');
      for (const item of before) assert.deepEqual(await snapshot(item.id), snapshotsBefore.get(item.id));
      assert.deepEqual(await activity(), activityBefore, 'Refused deletion writes no activity.');
    };

    // Edit access can read the populated preview, but cannot delete it by either door.
    await bob.page.goto(citation(intermediate), { waitUntil: 'networkidle' });
    await expect(bob.page.locator('.revision-preview')).toContainText('Remove only this intermediate content.');
    await expect(deleteControl(bob.page)).toHaveCount(0);
    const forbidden = await call(bob.context, origin, 'DELETE', `/api/revisions/${pageId}/${intermediate}`, { operationKey: randomUUID() });
    assert.equal(forbidden.status, 404);
    await unchanged();

    const bobGrant = (await ok(alice.context, origin, 'GET', `/api/sharing/pages/${pageId}`)).items.find(item => item.principalId === bob.id);
    await grant(alice.context, origin, pageId, bob.id, 'full', { id: bobGrant.id });
    for (const id of [working, published]) {
      await bob.page.goto(citation(id), { waitUntil: 'networkidle' });
      await expect(bob.page.locator('.revision-preview')).toBeVisible();
      await expect(deleteControl(bob.page)).toHaveCount(0);
      const refused = await call(bob.context, origin, 'DELETE', `/api/revisions/${pageId}/${id}`, { operationKey: randomUUID() });
      assert.equal(refused.status, 409);
      assert.equal(refused.body.code, 'CURRENT_REVISION');
      await unchanged();
    }
    await profile({ 'page.version.v1': 'autosnapshot' });
    await bob.page.goto(citation(intermediate), { waitUntil: 'networkidle' });
    await expect(bob.page.locator('.revision-preview')).toContainText('Remove only this intermediate content.');
    await expect(deleteControl(bob.page)).toHaveCount(0);
    const hidden = await call(bob.context, origin, 'DELETE', `/api/revisions/${pageId}/${intermediate}`, { operationKey: randomUUID() });
    assert.equal(hidden.status, 409);
    assert.equal(hidden.body.code, 'POLICY_RESTRICTED');
    // The profile itself changed, so compare deletion-owned data rather than workspace projection.
    assert.deepEqual(await history(), before);
    for (const item of before) assert.deepEqual(await snapshot(item.id), snapshotsBefore.get(item.id));
    assert.deepEqual(await activity(), activityBefore);
    await profile({ 'page.version.v1': 'labelled' });

    // A full member confirms exactly one native destructive action.
    await bob.page.goto(citation(intermediate), { waitUntil: 'networkidle' });
    const rowBefore = bob.page.locator('.history-list li').filter({ hasText: 'Version 2' });
    await expect(rowBefore).toContainText('Intermediate publication');
    await deleteControl(bob.page).click();
    const dialog = bob.page.getByRole('dialog', { name: 'Delete this intermediate revision?', exact: true });
    const response = bob.page.waitForResponse(item => item.request().method() === 'DELETE' && new URL(item.url()).pathname === `/api/revisions/${pageId}/${intermediate}`);
    await dialog.getByRole('button', { name: 'Delete revision', exact: true }).click();
    const committed = await response;
    assert.equal(committed.status(), 200);
    const input = committed.request().postDataJSON(), receipt = await committed.json();
    await expect(dialog).toBeHidden();
    const after = await history(), tombstone = after.find(item => item.id === intermediate);
    assert.deepEqual(after.map(item => item.id), before.map(item => item.id), 'Deletion retains every history position.');
    assert.equal(tombstone.ordinal, 2);
    assert.equal(tombstone.deletedByMemberId, bob.id);
    assert.equal(tombstone.deletedByDisplayName, bob.name);
    assert.ok(Number.isFinite(Date.parse(tombstone.deletedAt)));
    assert.equal(tombstone.label, null, 'The deleted content label is removed.');
    for (const item of before.filter(item => item.id !== intermediate)) {
      assert.deepEqual(after.find(kept => kept.id === item.id), item, 'Every other history entry is unchanged.');
      assert.deepEqual(await snapshot(item.id), snapshotsBefore.get(item.id), 'Every other snapshot is unchanged.');
    }
    const deletedSnapshot = await snapshot(intermediate);
    assert.equal(deletedSnapshot.deleted, true);
    assert.equal(deletedSnapshot.blocks, undefined);
    assert.equal(deletedSnapshot.properties, undefined);
    assert.deepEqual(await read(), documentBefore, 'Working and published content stay intact.');
    assert.equal((await snapshot(first)).blocks[0].content.text[0].text, 'Keep the first publication.');
    assert.equal((await snapshot(published)).blocks[0].content.text[0].text, 'Keep the current published content.');
    assert.equal((await snapshot(working)).blocks[0].content.text[0].text, 'Keep the newer unpublished working content.');
    const entries = await activity();
    assert.equal(entries.length, activityBefore.length + 1);
    const entry = entries.find(item => item.operationKey === input.operationKey);
    assert.equal(entry.id, receipt.receipt.activityId);
    assert.equal(entry.actor.id, bob.id);
    assert.equal(entry.occurredAt, tombstone.deletedAt);
    assert.deepEqual(await ok(bob.context, origin, 'DELETE', `/api/revisions/${pageId}/${intermediate}`, input), receipt);
    assert.deepEqual(await history(), after, 'Replay retains the original deletion time and attribution.');
    assert.deepEqual(await activity(), entries, 'Replay creates no second activity entry.');

    await bob.page.reload({ waitUntil: 'networkidle' });
    const row = bob.page.locator('.history-list li').filter({ hasText: 'Version 2' });
    await expect(row).toContainText(`Deleted by ${bob.name} on`);
    const deletedTime = row.locator('time').nth(1);
    await expect(deletedTime).toHaveAttribute('datetime', tombstone.deletedAt);
    assert.match(await deletedTime.innerText(), /\d{2} \w{3} \d{4}, \d{2}:\d{2}:\d{2}/);
    await expect(row).not.toContainText('Intermediate publication');
    await expect(bob.page.locator('.revision-preview')).toHaveCount(0);
    await expect(bob.page.getByText('This exact revision has been deleted. Its content is unavailable.', { exact: true })).toBeVisible();
    await expect(bob.page.locator('.history-list li')).toHaveCount(before.length);
    await expect(bob.page.locator('body')).not.toContainText('Remove only this intermediate content.');
    await shot('bob', 'numbered tombstone with deleting member and time after reload');
    await accessible(bob.page, 'numbered deletion tombstone');
    record('versionDeletion', { pageId, first, intermediate, published, working, tombstone, activity: entry, replayActivityCount: entries.length });
    console.info(`PROBE REV-006 1: edit-only, current, published and autosnapshot DELETE requests -> refused without revision or activity changes`);
    console.info(`PROBE REV-006 2: full-member History confirmation -> version 2 content removed, attributed timed tombstone after reload; every other revision retained; replay has one activity`);
  } finally {
    await profile(originalPolicies);
  }
}
