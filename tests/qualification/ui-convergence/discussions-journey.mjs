import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { openPageAction } from './browser-support.mjs';
import { randomUUID } from 'node:crypto';
import { grant, call, ok, restrictedPage } from './two-people-support.mjs';
import { commentJourney } from './comments-journey.mjs';

/** Filter the same discussion across authors, replies, kinds and states. */
export async function discussionsJourney(state, people, pageId, anchoredThread, grantId) {
  const { page, context, origin, api } = state;
  const bob = people.bob.page;
  await grant(context, origin, pageId, people.bob.id, 'comment', { id: grantId });
  await bob.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  await openPageAction(bob, 'Comments');
  await bob.getByRole('textbox', { name: 'Comment text', exact: true }).fill('The incoming shift has reviewed the incident timeline.');
  await bob.getByRole('button', { name: 'Send comment', exact: true }).click();
  await expect(bob.locator('.comment-thread')).toHaveCount(2);
  const bobThread = bob.locator('.comment-thread').filter({ hasText: 'The incoming shift has reviewed the incident timeline.' });
  await expect(bobThread).toContainText('Morgan Reader');
  const inlineReply = bob.locator(`#thread-${anchoredThread.id}`);
  await inlineReply.getByRole('button', { name: 'Reply', exact: true }).first().click();
  await bob.getByRole('textbox', { name: 'Reply text', exact: true }).fill('I will follow up with the escalation lead.');
  await bob.getByRole('button', { name: 'Send comment', exact: true }).click();
  await expect(inlineReply).toContainText('I will follow up with the escalation lead.');

  await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  await openPageAction(page, 'Comments');
  const threads = page.locator('.comment-thread');
  const orphan = page.locator(`#thread-${anchoredThread.id}`);
  const status = page.getByRole('combobox', { name: 'Threads', exact: true });
  const kind = page.getByRole('combobox', { name: 'Thread kind', exact: true });
  const person = page.getByRole('combobox', { name: 'Thread person', exact: true });
  await expect(threads).toHaveCount(2);
  await orphan.getByRole('button', { name: 'Reopen', exact: true }).click();
  await expect(orphan.getByRole('button', { name: 'Resolve', exact: true })).toBeVisible();
  await status.selectOption('open');
  await expect(threads).toHaveCount(2);
  await kind.selectOption('inline');
  await person.selectOption(people.bob.id);
  await expect(threads).toHaveCount(1);
  await expect(orphan).toContainText('Original text is no longer on the page.');
  await expect(orphan).toContainText('I will follow up with the escalation lead.');
  await person.selectOption('browser-owner');
  await expect(orphan).toBeVisible();
  await kind.selectOption('page');
  await expect(threads).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'No threads match these filters.' })).toBeVisible();
  await person.selectOption(people.bob.id);
  await expect(threads).toHaveCount(1);
  await expect(threads).toContainText('The incoming shift has reviewed the incident timeline.');
  const before = await api(`/api/comments/page/${pageId}`);
  assert.equal(before.threads.filter(thread => thread.state === 'open').length, 2, 'Both the visible page thread and hidden orphan are open.');
  await page.getByRole('button', { name: 'Resolve all open threads', exact: true }).click();
  await expect(threads).toHaveCount(0);
  const resolved = await api(`/api/comments/page/${pageId}`);
  assert.equal(resolved.threads.length, 2);
  assert.ok(resolved.threads.every(thread => thread.state === 'resolved'), 'Resolve all includes the orphan hidden by the current filters.');
  await status.selectOption('resolved');
  await expect(threads).toHaveCount(1);
  await kind.selectOption('inline');
  await expect(orphan).toContainText('Original text is no longer on the page.');
  await kind.selectOption('all');
  await person.selectOption('all');
  await expect(threads).toHaveCount(2);
  await page.screenshot({ path: `.artifacts/ui-convergence/discussions-${page.viewportSize().width}-resolved.png`, fullPage: true });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.comment-thread')).toHaveCount(2);
  await expect(page.locator('.comment-thread').getByRole('button', { name: 'Reopen', exact: true })).toHaveCount(2);
  await grant(context, origin, pageId, people.bob.id, 'view', { id: grantId });
  await bob.reload({ waitUntil: 'networkidle' });
  await expect(bob.getByText('Read-only discussion.', { exact: true })).toBeVisible();
  await expect(bob.getByRole('button', { name: 'Resolve all open threads', exact: true })).toHaveCount(0);
}

/** Another author resolves and reopens retained inline and page discussions. */
export async function resolveThreadsJourney(state, people) {
  const { page, context, origin, api } = state;
  const bob = people.bob.page;
  const { pageId } = await restrictedPage(state, 'Shift discussion handover', [
    'The on-call lead owns escalation decisions.',
    ...Array.from({ length: 24 }, (_, index) => `Handover step ${index + 1}: check service health before transferring responsibility.`),
  ]);
  await commentJourney(state, pageId);
  await openPageAction(page, 'Comments');
  await page.getByRole('textbox', { name: 'Comment text', exact: true }).fill('The handover checklist is ready for the next shift.');
  await page.getByRole('button', { name: 'Send comment', exact: true }).click();
  await expect(page.locator('.comment-thread')).toHaveCount(2);
  const created = await api(`/api/comments/page/${pageId}`);
  const inline = created.threads.find(thread => thread.kind === 'inline');
  const pageThread = created.threads.find(thread => thread.kind === 'page');
  const { anchorId } = JSON.parse(inline.anchor_json);
  const bodyBefore = await api(`/api/pages/${pageId}`);
  const memberGrant = await grant(context, origin, pageId, people.bob.id, 'comment');
  await bob.goto(`${origin}/app/pages/${pageId}?detail=comments`, { waitUntil: 'networkidle' });
  assert.equal((await ok(people.bob.context, origin, 'GET', `/api/pages/${pageId}`)).permissions.level, 'comment');
  const panel = thread => bob.locator(`#thread-${thread.id}`);
  for (const thread of [inline, pageThread]) {
    const discussion = panel(thread);
    await expect(discussion.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(discussion.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
    await discussion.getByRole('button', { name: 'Reply', exact: true }).first().click();
    await bob.getByRole('textbox', { name: 'Reply text', exact: true }).fill(`Morgan reviewed the ${thread.kind} discussion.`);
    await bob.getByRole('button', { name: 'Send comment', exact: true }).click();
    await expect(discussion).toContainText(`Morgan reviewed the ${thread.kind} discussion.`);
    const root = discussion.locator('.comment').first();
    await root.getByRole('button', { name: 'React with thumbs up', exact: true }).click();
    await expect(root.getByRole('list', { name: 'Reactions', exact: true })).toContainText('👍 Morgan Reader');
  }
  const retained = await api(`/api/comments/page/${pageId}`);
  const captures = [];
  async function retainedState(thread, resolved) {
    const current = await api(`/api/comments/page/${pageId}`);
    const stored = current.threads.find(item => item.id === thread.id);
    assert.equal(stored.state, resolved ? 'resolved' : 'open');
    assert.equal(stored.resolved_by_member_id, resolved ? people.bob.id : null);
    assert.equal(stored.anchor_json, thread.anchor_json);
    assert.equal(stored.block_id, thread.block_id);
    assert.deepEqual(current.comments, retained.comments, 'Transitions retain every comment, author, timestamp and revision.');
    assert.deepEqual(current.reactions, retained.reactions, 'Transitions retain the same reaction identities and people.');
    const discussion = panel(thread);
    await expect(discussion.getByRole('button', { name: resolved ? 'Reopen' : 'Resolve', exact: true })).toBeVisible();
    for (const comment of retained.comments.filter(comment => comment.threadId === thread.id)) {
      await expect(bob.locator(`#comment-${comment.id}`)).toContainText(comment.body.map(span => span.text).join(''));
    }
    await expect(discussion.getByRole('list', { name: 'Reactions', exact: true }).first()).toContainText('👍 Morgan Reader');
    const document = await ok(people.bob.context, origin, 'GET', `/api/pages/${pageId}`);
    assert.deepEqual(document.blocks, bodyBefore.blocks, 'Resolution does not rewrite the anchored page content.');
    if (thread.kind === 'inline') {
      assert.equal(document.resolvedCommentAnchorIds.includes(anchorId), resolved);
      const anchor = bob.locator(`.page-document [data-comment-anchor="${anchorId}"]`);
      await expect(anchor).toHaveText('The on-call lead');
      await expect(bob.locator(`.page-document mark[data-comment-anchor="${anchorId}"]`)).toHaveCount(resolved ? 0 : 1);
      await discussion.getByRole('button', { name: 'Jump to selected text', exact: true }).click();
      await expect(anchor).toBeInViewport({ ratio: 1 });
    }
  }
  async function transition(thread, resolved) {
    const receipt = bob.waitForResponse(response => new URL(response.url()).pathname === `/api/comments/thread/${thread.id}/resolve` && response.request().method() === 'POST');
    await panel(thread).getByRole('button', { name: resolved ? 'Resolve' : 'Reopen', exact: true }).click();
    const response = await receipt;
    assert.equal(response.status(), 200);
    captures.push({ thread, input: response.request().postDataJSON() });
    await retainedState(thread, resolved);
    await bob.reload({ waitUntil: 'networkidle' });
    await retainedState(thread, resolved);
    console.log(`PROBE COMM-007 ${thread.kind} ${resolved ? 'resolve' : 'reopen'}: native comment-level control -> retained discussion and reactions, stable body anchor, reload persisted`);
  }
  await transition(inline, false);
  for (const thread of [inline, pageThread]) {
    await transition(thread, true);
    const query = thread.kind === 'inline' ? 'escalation' : 'checklist';
    const search = await ok(people.bob.context, origin, 'GET', `/api/search?kind=comment-thread&q=${query}`);
    assert.deepEqual(search.items.map(item => item.id), [thread.id]);
    assert.equal(search.total, 1);
    assert.ok(search.items[0].snippet.includes(query));
    assert.equal(new URL(search.items[0].href, origin).searchParams.get('thread'), thread.id);
    await bob.goto(`${origin}/app/search?kind=comment-thread&q=${query}`, { waitUntil: 'networkidle' });
    const result = bob.locator('.search-results a').filter({ hasText: query });
    await expect(result).toHaveCount(1);
    await result.click();
    await expect(panel(thread)).toContainText(thread.kind === 'inline' ? 'Please confirm the escalation owner.' : 'The handover checklist is ready for the next shift.');
    await expect(panel(thread).getByRole('button', { name: 'Reopen', exact: true })).toBeVisible();
    await retainedState(thread, true);
    await bob.screenshot({ path: `.artifacts/ui-convergence/resolve-${bob.viewportSize().width}-${thread.kind}.png`, fullPage: true });
    await transition(thread, false);
    await transition(thread, true);
    console.log(`PROBE COMM-007 retained ${thread.kind}: native search ${query} -> exact retained thread, reopen and resolve persisted`);
  }
  await grant(context, origin, pageId, people.bob.id, 'view', { id: memberGrant.value.id });
  await bob.reload({ waitUntil: 'networkidle' });
  await expect(bob.getByText('Read-only discussion.', { exact: true })).toBeVisible();
  await expect(bob.locator('.comment-thread').getByRole('button', { name: /^(Resolve|Reopen)$/ })).toHaveCount(0);
  await expect(bob.getByRole('button', { name: 'Resolve all open threads', exact: true })).toHaveCount(0);
  const beforeRefusal = await api(`/api/comments/page/${pageId}`);
  for (const thread of beforeRefusal.threads) {
    for (const resolved of [false, true]) {
      const refused = await call(people.bob.context, origin, 'POST', `/api/comments/thread/${thread.id}/resolve`, {
        operationKey: randomUUID(), expectedRevisionId: thread.revision_id, resolved,
      });
      assert.equal(refused.status, 403);
      assert.deepEqual(await api(`/api/comments/page/${pageId}`), beforeRefusal);
    }
  }
  for (const capture of captures) {
    const replay = await call(people.bob.context, origin, 'POST', `/api/comments/thread/${capture.thread.id}/resolve`, capture.input);
    assert.equal(replay.status, 403, 'Revoked comment authority cannot replay a captured transition.');
  }
  assert.equal((await call(people.bob.context, origin, 'POST', `/api/comments/page/${pageId}/resolve-all`, { operationKey: randomUUID() })).status, 403);
  assert.deepEqual(await api(`/api/comments/page/${pageId}`), beforeRefusal, 'Viewer mutations and captured replays change nothing.');
  console.log('PROBE COMM-007 authority: viewer resolve, reopen, resolve-all and captured transitions -> 403 with byte-equivalent retained discussions');
}
