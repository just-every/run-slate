import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { accessible, closeDetails, openPageAction } from './browser-support.mjs';
import { ok } from './two-people-support.mjs';

/** Ordinary page edits retain the member's independent grant and content custody. */
export async function permissionPageEditsMatrix({ state, bob, api, level, pageId, blockId, recipientId, snapshot, refuse, records }) {
  const view = bob.page, route = `/api/pages/${pageId}`;
  const canEdit = level === 'full' || level === 'edit';
  const current = () => api(route);
  const reopen = () => view.reload({ waitUntil: 'networkidle' });
  const capture = async (method, target, action, perform, verify, submitted) => {
    const before = await snapshot();
    const pending = perform ? view.waitForResponse(response => new URL(response.url()).pathname === target && response.request().method() === method) : null;
    const direct = perform ? (await perform(), null) : await ok(bob.context, state.origin, method, target, submitted);
    // Native controls and direct body-structure requests use the same receipt checks.
    const response = direct ? null : await pending;
    if (response) assert.equal(response.status(), 200, await response.text());
    const input = direct ? submitted : response.request().postDataJSON();
    const result = direct ?? await response.json();
    const contentEdit = action === 'pages.update' || action === 'pages.blocks.replace';
    if (contentEdit) {
      // The browser polls direct structure edits too. Wait for its actual read
      // receipt before freezing the inventory used to judge duplicate captures.
      await expect.poll(async () => (await api('/api/activity?' + new URLSearchParams({ actorId: bob.id, action: 'pages.open', limit: '100' }))).items
        .some(item => item.target.id === pageId && item.context.revisionId === result.receipt.revisionId),
      { timeout: 15000, intervals: [250, 500] }).toBe(true);
    }
    await view.waitForLoadState('networkidle');
    const after = await snapshot();
    assert.equal(result.receipt.operationKey, input.operationKey);
    assert.equal(after.document.page.revisionId, result.receipt.revisionId);
    const mutations = after.activity.filter(item => !before.activity.some(old => old.id === item.id) && item.action !== 'pages.open');
    assert.equal(mutations.length, 1);
    assert.deepEqual([mutations[0].id, mutations[0].action, mutations[0].operationKey, mutations[0].actor.id, mutations[0].occurredAt],
      [result.receipt.activityId, action, input.operationKey, bob.id, result.receipt.committedAt]);
    for (const previous of before.activity) assert.deepEqual(after.activity.find(item => item.id === previous.id), previous);
    assert.deepEqual(after.comments, before.comments);
    assert.deepEqual(after.grants, before.grants, 'Page editing and ownership never rewrite grants.');
    assert.equal(after.revisions.items.length, before.revisions.items.length + Number(contentEdit));
    for (const previous of before.revisions.items) assert.deepEqual(after.revisions.items.find(item => item.id === previous.id), previous);
    if (contentEdit) {
      assert.equal(after.document.workingRevisionId, result.receipt.revisionId);
      assert.ok(after.revisions.items.some(item => item.id === result.receipt.revisionId));
    } else {
      assert.deepEqual(after.revisions, before.revisions, 'Lock state creates no content version.');
      assert.deepEqual(after.document.blocks, before.document.blocks);
      assert.deepEqual(after.document.properties, before.document.properties);
      assert.equal(after.document.workingRevisionId, before.document.workingRevisionId);
      assert.equal(after.document.publishedRevisionId, before.document.publishedRevisionId);
    }
    await verify(before, after, result);
    assert.deepEqual((await ok(bob.context, state.origin, method, target, input)).receipt, result.receipt);
    assert.deepEqual(await snapshot(), after, 'A repeated page edit changes no retained inventory.');
    records.push({ level, method, target, input, result, before, after });
    return result;
  };

  await reopen();
  await view.getByRole('button', { name: 'More', exact: true }).click();
  const menu = view.getByRole('menu');
  for (const name of ['Display settings', 'Add icon', 'Add cover', 'Add decision record', 'Move page', 'Save as template', 'Archive page', 'Move to trash', 'Lock page']) {
    await expect(menu.getByRole('menuitem', { name, exact: true })).toHaveCount(canEdit ? 1 : 0);
  }
  await expect(menu.getByRole('menuitem', { name: 'Public access', exact: true })).toHaveCount(level === 'full' ? 1 : 0);
  await view.keyboard.press('Escape');

  const display = { labels: [`permission-${level}`], typeface: 'serif', smallText: true, fullWidth: true };
  if (canEdit) {
    await openPageAction(view, 'Display settings');
    await capture('PATCH', route, 'pages.update', async () => {
      await view.getByRole('textbox', { name: 'Labels', exact: true }).fill(display.labels.join(', '));
      await view.getByRole('combobox', { name: 'Typeface', exact: true }).selectOption(display.typeface);
      await view.getByLabel('Small text', { exact: true }).check();
      await view.getByLabel('Full width', { exact: true }).check();
      await view.getByRole('button', { name: 'Save display settings', exact: true }).click();
    }, async (before, after) => {
      assert.deepEqual(after.document.properties, { ...before.document.properties, ...display });
      assert.deepEqual(after.document.blocks, before.document.blocks);
    });
    await expect(view.getByRole('status').filter({ hasText: 'Display settings saved.' })).toBeVisible();
    await reopen();
    if (!await view.getByRole('heading', { name: 'Display settings', exact: true }).isVisible()) await openPageAction(view, 'Display settings');
    await expect(view.getByRole('textbox', { name: 'Labels', exact: true })).toHaveValue(display.labels.join(', '));
    await expect(view.getByRole('combobox', { name: 'Typeface', exact: true })).toHaveValue(display.typeface);
    await expect(view.getByLabel('Small text', { exact: true })).toBeChecked();
    await expect(view.getByLabel('Full width', { exact: true })).toBeChecked();
    await accessible(view, `${level} member display edit after reload`);
    await closeDetails(view);
  } else {
    await refuse('PATCH', route, { operationKey: randomUUID(), expectedRevisionId: (await current()).page.revisionId, properties: display });
  }

  await openPageAction(view, 'Details');
  const panel = view.locator('.right');
  await expect(panel.getByRole('button', { name: 'Edit labels', exact: true })).toHaveCount(canEdit ? 1 : 0);
  await expect(panel.getByRole('button', { name: 'Reassign owner', exact: true })).toHaveCount(level === 'full' ? 1 : 0);
  if (level === 'full') {
    // Use another member, so the tested actor remains neither author nor owner.
    for (const ownerMemberId of [recipientId, 'browser-owner']) {
      await panel.getByRole('button', { name: 'Reassign owner', exact: true }).click();
      const dialog = view.getByRole('dialog', { name: 'Reassign owner', exact: true });
      await capture('PATCH', route, 'pages.update', async () => {
        await dialog.getByRole('combobox', { name: 'Owner', exact: true }).selectOption(ownerMemberId);
        await dialog.getByRole('button', { name: 'Save details', exact: true }).click();
      }, async (before, after) => {
        assert.deepEqual(after.document.properties, { ...before.document.properties, ownerMemberId });
        assert.deepEqual(after.document.blocks, before.document.blocks);
      });
      await expect(dialog).toBeHidden();
      await reopen();
      if (!await panel.getByRole('heading', { name: 'Page details', exact: true }).isVisible()) await openPageAction(view, 'Details');
      assert.equal((await current()).properties.ownerMemberId, ownerMemberId);
      const owner = (await api('/api/members')).items.find(item => item.id === ownerMemberId);
      await expect(panel.locator('dt').filter({ hasText: /^Owner$/ }).locator('+ dd')).toContainText(owner.displayName);
    }
  } else {
    await refuse('PATCH', route, { operationKey: randomUUID(), expectedRevisionId: (await current()).page.revisionId, properties: { ownerMemberId: recipientId } });
  }
  await accessible(view, `${level} member ownership authority after reload`);
  await closeDetails(view);

  const document = await current();
  const original = document.blocks.map(({ id, blockType, content, parentBlockId, treePosition }) => ({ id, blockType, content, parentBlockId, treePosition }));
  const inserted = { id: randomUUID(), blockType: 'paragraph', content: { text: [{ text: `Added ${level} handover step.` }] }, treePosition: 'z' };
  if (canEdit) {
    for (const blocks of [[...original, inserted], original]) {
      const verify = async (before, after) => {
        assert.deepEqual(after.document.properties, before.document.properties);
        assert.deepEqual(after.document.blocks.map(({ id, blockType, content, parentBlockId, treePosition }) => ({ id, blockType, content, parentBlockId, treePosition })),
          blocks.map(block => ({ ...block, parentBlockId: block.parentBlockId ?? null })));
        assert.equal(after.document.blocks.find(block => block.id === blockId).revisionId, before.document.blocks.find(block => block.id === blockId).revisionId);
      };
      const input = { operationKey: randomUUID(), expectedRevisionId: (await current()).page.revisionId, blocks };
      // This request is the editor's public structure door, with the member's own session.
      await capture('PUT', `${route}/blocks`, 'pages.blocks.replace', null, verify, input);
      await reopen();
      await expect(view.locator(`[data-block-id="${inserted.id}"]`)).toHaveCount(blocks.length === original.length ? 0 : 1);
      if (blocks.length > original.length) await expect(view.locator(`[data-block-id="${inserted.id}"]`)).toContainText(inserted.content.text[0].text);
    }
  } else {
    for (const blocks of [[...original, inserted], []]) await refuse('PUT', `${route}/blocks`, { operationKey: randomUUID(), expectedRevisionId: document.page.revisionId, blocks });
  }

  if (canEdit) {
    for (const locked of [true, false]) {
      await view.getByRole('button', { name: 'More', exact: true }).click();
      await capture('POST', `${route}/${locked ? 'lock' : 'unlock'}`, locked ? 'pages.lock' : 'pages.unlock',
        () => view.getByRole('menuitem', { name: locked ? 'Lock page' : 'Unlock page', exact: true }).click(),
        async (_before, after, result) => {
          assert.equal(result.value.locked, locked);
          assert.equal(after.document.permissions.canEdit, !locked);
          assert.equal(after.document.permissions.canUnlock, true);
          assert.deepEqual(after.document.lock, locked ? { lockedAt: result.receipt.committedAt, lockedByMemberId: bob.id, lockedByDisplayName: 'Morgan Reader' } : null);
        });
      await reopen();
      if (locked) await expect(view.getByRole('textbox', { name: 'Page title', exact: true })).toHaveAttribute('readonly', '');
      else await expect(view.getByRole('textbox', { name: 'Page title', exact: true })).not.toHaveAttribute('readonly', '');
      if (locked) {
        await expect(view.locator('[data-page-lock]')).toContainText('Locked by Morgan Reader');
        const lockedDocument = await current();
        await refuse('PATCH', route, { operationKey: randomUUID(), expectedRevisionId: lockedDocument.page.revisionId, properties: { title: 'Refused locked title' } }, 409);
      } else await expect(view.locator('[data-page-lock]')).toHaveCount(0);
    }
  } else {
    for (const action of ['lock', 'unlock']) await refuse('POST', `${route}/${action}`, { operationKey: randomUUID(), expectedRevisionId: (await current()).page.revisionId });
  }
  await accessible(view, `${level} member page edit authority after reload`);
}
