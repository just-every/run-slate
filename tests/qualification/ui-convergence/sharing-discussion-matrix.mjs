import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { accessible } from './browser-support.mjs';

/** Reconcile only the native discussion mutation; unrelated inventories stay exact. */
export function assertDiscussionMutation({ before, after, action, target, input, result, memberId, pageId }) {
  assert.equal(after.comments.length, before.comments.length);
  assert.equal(after.threads.length, before.threads.length);
  if (action === 'comments.reaction') {
    assert.deepEqual(after.comments, before.comments);
    assert.deepEqual(after.threads, before.threads);
    const selected = item => item.memberId === memberId && item.emoji === input.emoji && item.commentId === (input.commentId ?? null);
    if (input.remove) {
      assert.equal(before.reactions.filter(selected).length, 1);
      assert.deepEqual(after.reactions, before.reactions.filter(item => !selected(item)));
    } else {
      assert.equal(before.reactions.filter(selected).length, 0);
      assert.equal(after.reactions.length, before.reactions.length + 1);
      for (const previous of before.reactions) assert.deepEqual(after.reactions.find(item => item.id === previous.id), previous);
      const added = after.reactions.find(selected);
      assert.ok(added?.id);
      assert.deepEqual(added, { id: added.id, pageId: input.commentId ? null : pageId, commentId: input.commentId ?? null, memberId, displayName: 'Morgan Reader', emoji: input.emoji });
    }
    return;
  }
  assert.deepEqual(after.reactions, before.reactions);
  const expected = structuredClone(before);
  if (action === 'comments.edit' || action === 'comments.delete') {
    const id = target.split('/').at(-1), comment = expected.comments.find(item => item.id === id);
    assert.equal(comment.authorMemberId, memberId);
    Object.assign(comment, { body: input.delete ? null : input.body, deletedAt: input.delete ? result.receipt.committedAt : null, updatedAt: result.receipt.committedAt, revisionId: result.receipt.revisionId });
    const thread = expected.threads.find(item => item.id === comment.threadId);
    Object.assign(thread, { revision_id: result.receipt.revisionId, updated_at: result.receipt.committedAt });
    assert.deepEqual(after, expected);
    return;
  }
  const selected = action === 'comments.resolve-all' ? expected.threads.filter(item => item.state === 'open') : expected.threads.filter(item => item.id === target.split('/').at(-2));
  assert.ok(selected.length > 0);
  if (action === 'comments.resolve-all') assert.deepEqual(result.value.resolved, selected.map(item => item.id));
  for (const thread of selected) {
    const stored = after.threads.find(item => item.id === thread.id), resolved = input.resolved ?? true;
    assert.notEqual(stored.revision_id, thread.revision_id);
    if (action !== 'comments.resolve-all') assert.equal(stored.revision_id, result.receipt.revisionId);
    Object.assign(thread, { state: resolved ? 'resolved' : 'open', resolved_at: resolved ? result.receipt.committedAt : null, resolved_by_member_id: resolved ? memberId : null, revision_id: stored.revision_id, updated_at: result.receipt.committedAt });
  }
  assert.deepEqual(after, expected);
}

/** All four levels use the same populated discussion and independently granted page. */
export async function permissionDiscussionMatrix({ view, api, level, pageId, ownerComment, memberComment, committed, refuse }) {
  const commentsRoute = `/api/comments/page/${pageId}`, panel = view.locator('.right');
  const comment = id => view.locator(`#comment-${id}`);
  const read = () => api(commentsRoute);
  const reopen = async () => {
    await view.reload({ waitUntil: 'networkidle' });
    if (!await panel.isVisible()) await view.getByRole('button', { name: 'Comments', exact: true }).click();
  };
  const ownerThread = (await read()).comments.find(item => item.id === ownerComment).threadId;
  const thread = view.locator(`#thread-${ownerThread}`);
  if (level !== 'view') {
    const replyText = `Reply from the ${level} member.`;
    const reply = await committed('POST', commentsRoute, 'comments.create', async () => {
      await comment(ownerComment).getByRole('button', { name: 'Reply', exact: true }).click();
      await view.getByRole('textbox', { name: 'Reply text', exact: true }).fill(replyText);
      await view.getByRole('button', { name: 'Send comment', exact: true }).click();
    });
    assert.equal(reply.value.threadId, ownerThread);
    await reopen();
    await expect(thread.locator(`#comment-${reply.value.id}`)).toContainText(replyText);
    const editedText = `Edited ${level} response confirmed.`;
    await committed('PATCH', `/api/comments/${memberComment}`, 'comments.edit', async () => {
      await comment(memberComment).getByRole('button', { name: 'Edit', exact: true }).click();
      await view.getByRole('textbox', { name: 'Edit comment text', exact: true }).fill(editedText);
      await view.getByRole('button', { name: 'Save comment', exact: true }).click();
    });
    await reopen();
    await expect(comment(memberComment)).toContainText(editedText);
    await expect(comment(memberComment).locator('small time')).toBeVisible();
    // A full page grant does not confer authorship of another person's comment.
    for (const change of [{ body: [{ text: 'Refused cross-author replacement' }] }, { delete: true }]) {
      const other = (await read()).comments.find(item => item.id === ownerComment);
      await expect(comment(ownerComment).getByRole('button', { name: change.delete ? 'Delete' : 'Edit', exact: true })).toHaveCount(0);
      await refuse('PATCH', `/api/comments/${ownerComment}`, { operationKey: randomUUID(), expectedRevisionId: other.revisionId, ...change }, 403);
    }
    for (const resolved of [true, false]) {
      await committed('POST', `/api/comments/thread/${ownerThread}/resolve`, 'comments.resolve', () => thread.getByRole('button', { name: resolved ? 'Resolve' : 'Reopen', exact: true }).click());
      await reopen();
      await expect(thread.getByRole('button', { name: resolved ? 'Reopen' : 'Resolve', exact: true })).toBeVisible();
    }
    await committed('POST', `${commentsRoute}/resolve-all`, 'comments.resolve-all', () => view.getByRole('button', { name: 'Resolve all open threads', exact: true }).click());
    await reopen();
    assert.ok((await read()).threads.every(item => item.state === 'resolved'));
    await expect(panel.getByRole('button', { name: 'Resolve', exact: true })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Reopen', exact: true })).toHaveCount(2);
    await committed('PATCH', `/api/comments/${memberComment}`, 'comments.delete', () => comment(memberComment).getByRole('button', { name: 'Delete', exact: true }).click());
    await reopen();
    await expect(comment(memberComment)).toContainText('Comment deleted');
    await expect(comment(memberComment)).not.toContainText(editedText);
    await expect(comment(memberComment).getByRole('button', { name: /^(Edit|Delete)$/ })).toHaveCount(0);
  } else {
    await expect(panel.getByRole('button', { name: /^(Reply|Edit|Delete|Resolve|Reopen|Resolve all open threads)$/ })).toHaveCount(0);
    const other = (await read()).comments.find(item => item.id === ownerComment);
    await refuse('POST', commentsRoute, { operationKey: randomUUID(), threadId: ownerThread, body: [{ text: 'Refused view reply' }] });
    for (const change of [{ body: [{ text: 'Refused view edit' }] }, { delete: true }]) await refuse('PATCH', `/api/comments/${ownerComment}`, { operationKey: randomUUID(), expectedRevisionId: other.revisionId, ...change });
    const current = (await read()).threads.find(item => item.id === ownerThread);
    await refuse('POST', `/api/comments/thread/${ownerThread}/resolve`, { operationKey: randomUUID(), expectedRevisionId: current.revision_id, resolved: true });
    await refuse('POST', `${commentsRoute}/resolve-all`, { operationKey: randomUUID() });
  }
  await accessible(view, `${level} discussion authority after reload`);

  // PAGE-009 and COMM-005 explicitly permit reactions to readable content,
  // including view-level readers. Retain that more specific native duty.
  for (const target of ['comment', 'page']) {
    if (target === 'page') {
      await view.locator('.detail-close').click();
      await view.locator('.page-reactions > summary').click();
    }
    const region = target === 'comment' ? comment(ownerComment) : view.getByRole('region', { name: 'Page reactions', exact: true });
    const button = () => region.getByRole('button', { name: 'React with thumbs up', exact: true });
    for (const remove of [false, true]) {
      await expect(button()).toHaveAttribute('aria-pressed', String(remove));
      const readership = await api(`/api/analytics?pageId=${pageId}`), notifications = await api('/api/notifications');
      const result = await committed('POST', `${commentsRoute}/reaction`, 'comments.reaction', () => button().click());
      assert.equal(result.value.reacted, !remove);
      assert.deepEqual(await api(`/api/analytics?pageId=${pageId}`), readership, 'Adding or removing a reaction does not count as reading the page.');
      assert.deepEqual(await api('/api/notifications'), notifications, 'Reactions notify no one.');
      await view.reload({ waitUntil: 'networkidle' });
      if (target === 'comment' && !await panel.isVisible()) await view.getByRole('button', { name: 'Comments', exact: true }).click();
      if (target === 'page' && !await region.isVisible()) await view.locator('.page-reactions > summary').click();
      await expect(button()).toHaveAttribute('aria-pressed', String(!remove));
      if (remove) await expect(region.getByRole('list', { name: 'Reactions', exact: true })).not.toContainText('Morgan Reader');
      else await expect(region.getByRole('list', { name: 'Reactions', exact: true })).toContainText('👍 Morgan Reader');
    }
    await accessible(view, `${level} ${target} reaction persisted after reload`);
  }
  // Return to the discussion before the caller closes its existing panel.
  await view.locator('.page-reactions > summary').click();
  await view.getByRole('button', { name: 'Comments', exact: true }).click();
}
