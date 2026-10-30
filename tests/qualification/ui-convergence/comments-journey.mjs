import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { withSecondPerson, call, ok, grant, restrictedPage } from './two-people-support.mjs';
import { accessible, closeDetails, openPageAction } from './browser-support.mjs';
import { insideViewport, withinViewport } from './browser-evidence.mjs';

export async function commentJourney({ page, origin, api }, pageId) {
  await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  const paragraph = page.getByRole('textbox', { name: 'Paragraph', exact: true }).first();
  await paragraph.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ControlOrMeta+Home');
  for (let index = 0; index < 'The on-call lead'.length; index++) await page.keyboard.press('Shift+ArrowRight');
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  const composer = page.locator('.comment-form');
  await expect(page.locator('.right').getByRole('heading', { name: 'Comments', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close details ×', exact: true })).toBeVisible();
  const send = page.getByRole('button', { name: 'Send comment', exact: true });
  await expect(send).toBeDisabled();
  await insideViewport(page, send, 'Anchored comment Send');
  await expect(composer.locator('blockquote')).toContainText('The on-call lead');
  await expect(page.locator('.page-document')).not.toContainText('Saved page structure');
  const filter = page.getByRole('combobox', { name: 'Threads', exact: true });
  await expect(filter).toHaveValue('all');
  const labelSpace = await filter.evaluate(select => {
    const label = select.closest('label');
    if (!label) return false;
    const text = label.querySelector('span') ?? [...label.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (!text) return false;
    const range = document.createRange(); range.selectNodeContents(text);
    const a = range.getBoundingClientRect(), b = select.getBoundingClientRect();
    return b.top >= a.bottom || b.left - a.right >= 4;
  });
  assert.ok(labelSpace, 'Threads label is separated from its value.');
  await page.getByRole('textbox', { name: 'Comment text', exact: true }).fill('Please confirm the escalation owner.');
  await withinViewport(page, page.getByRole('button', { name: 'Send comment', exact: true }), 'Filled anchored comment Send');
  await accessible(page, 'anchored comment composer');
  await page.getByRole('button', { name: 'Send comment', exact: true }).click();
  await expect(page.locator('.comment-thread')).toContainText('Please confirm the escalation owner.');
  await expect(composer.locator('blockquote')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Comment text', exact: true })).toBeEmpty();
  const comments = await api(`/api/comments/page/${pageId}`);
  assert.equal(comments.threads.length, 1);
  assert.equal(comments.threads[0].kind, 'inline');
  const anchor = JSON.parse(comments.threads[0].anchor_json);
  assert.equal(anchor.quote, 'The on-call lead');
  const anchoredDocument = await api(`/api/pages/${pageId}`);
  assert.equal(comments.threads[0].block_id, anchoredDocument.blocks[0].id);
  assert.equal(comments.threads[0].anchor_revision_id, anchoredDocument.workingRevisionId);
  assert.ok(JSON.stringify(anchoredDocument.blocks[0].content).includes(anchor.anchorId));
  await expect(paragraph.locator('mark')).toHaveText('The on-call lead');
  await expect(send).toBeDisabled();
  await insideViewport(page, send, 'Reset comment Send');
  await accessible(page, 'saved anchored comment');
  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  await page.getByRole('textbox', { name: 'Reply text', exact: true }).fill('Confirmed: the on-call lead.');
  await expect(composer.locator('blockquote')).toHaveCount(0);
  await withinViewport(page, page.getByRole('button', { name: 'Send comment', exact: true }), 'Reply Send');
  await accessible(page, 'reply composer');
  await page.getByRole('button', { name: 'Send comment', exact: true }).click();
  await expect(page.locator('.comment-thread')).toContainText('Confirmed: the on-call lead.');
  await expect(page.getByRole('textbox', { name: 'Comment text', exact: true })).toBeEmpty();
  await expect(composer.locator('blockquote')).toHaveCount(0);
  await expect(send).toBeDisabled();
  await insideViewport(page, send, 'Sent reply Send');
  await page.getByRole('button', { name: 'Resolve', exact: true }).click();
  await expect(page.locator('.comment-thread')).toContainText('Resolved');
  const resolved = await api(`/api/comments/page/${pageId}`);
  assert.equal(resolved.threads[0].state, 'resolved');
  assert.equal(resolved.comments.length, 2);
  await filter.selectOption('open');
  await expect(page.locator('.comment-thread')).toHaveCount(0);
  await filter.selectOption('resolved');
  await expect(page.locator('.comment-thread')).toContainText('Please confirm the escalation owner.');
  await expect(page.locator('.comment-thread')).toContainText('Confirmed: the on-call lead.');
  await expect(send).toBeDisabled();
  await insideViewport(page, send, 'Resolved-filter comment Send');
  await accessible(page, 'resolved discussion');
  await closeDetails(page);
  await expect(page.locator('.right')).toHaveCount(0);
  await expect(paragraph).toBeFocused();
}

/** COMM-002: both native sessions own their comments, never each other's. */
export async function commentAuthorshipJourney(state, width) {
  await withSecondPerson(state, width, async ({ alice, bob }) => {
    const { origin } = state;
    const { pageId } = await restrictedPage(state, 'Comment handover', ['Confirm the escalation owner before the next shift.']);
    await grant(alice.context, origin, pageId, bob.id, 'comment');
    const commentsPath = `/api/comments/page/${pageId}`;
    const records = [], refusals = [];
    const session = async person => (await ok(person.context, origin, 'GET', '/api/session')).member;
    const members = [await session(alice), await session(bob)];
    assert.equal(members[0].role, 'owner');
    assert.equal(members[1].role, 'member');
    assert.equal((await ok(bob.context, origin, 'GET', `/api/pages/${pageId}`)).permissions.level, 'comment');
    const read = () => ok(alice.context, origin, 'GET', commentsPath);
    const activity = async () => (await ok(alice.context, origin, 'GET', '/api/activity?kind=comment-thread&limit=100')).items.filter(entry => entry.context.pageId === pageId);
    const snapshot = async () => ({ comments: await read(), activity: await activity() });
    const open = async person => {
      await person.page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
      await openPageAction(person.page, 'Comments');
    };
    const article = (person, id) => person.page.locator(`#comment-${id}`);
    const committed = async (person, path, action, perform) => {
      const pending = person.page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === (action === 'comments.create' ? 'POST' : 'PATCH'));
      await perform();
      const response = await pending;
      assert.equal(response.status(), 200, await response.text());
      const result = await response.json(), input = response.request().postDataJSON();
      const { receipt } = result;
      assert.equal(receipt.operationKey, input.operationKey);
      assert.equal(receipt.entity.kind, 'comment-thread');
      assert.equal(receipt.entity.revisionId, result.value.revisionId);
      assert.equal(receipt.revisionId, result.value.revisionId);
      assert.ok(receipt.activityId);
      const author = (await session(person)).id;
      const saved = (await read()).comments.find(comment => comment.id === result.value.id);
      assert.equal(saved.authorMemberId, author);
      assert.equal(receipt.entity.id, saved.threadId);
      assert.equal(saved.revisionId, receipt.revisionId);
      assert.equal(saved.updatedAt, receipt.committedAt);
      if (action === 'comments.delete') {
        assert.equal(saved.deletedAt, receipt.committedAt);
        assert.equal(saved.body, null);
      } else {
        assert.equal(saved.deletedAt, null);
        assert.deepEqual(saved.body, input.body);
      }
      const entries = (await activity()).filter(entry => entry.operationKey === input.operationKey);
      assert.equal(entries.length, 1);
      assert.equal(entries[0].id, receipt.activityId);
      assert.equal(entries[0].action, action);
      assert.equal(entries[0].actor.id, author);
      assert.equal(entries[0].occurredAt, receipt.committedAt);
      assert.deepEqual(entries[0].target, { kind: 'comment-thread', id: saved.threadId });
      assert.equal(entries[0].context.commentId, saved.id);
      records.push({ path, action, input, result, activity: entries[0] });
      return saved;
    };

    await open(alice);
    let first = await committed(alice, commentsPath, 'comments.create', async () => {
      await alice.page.getByRole('textbox', { name: 'Comment text', exact: true }).fill('Owner handover: confirm the rota.');
      await alice.page.getByRole('button', { name: 'Send comment', exact: true }).click();
    });
    await expect(article(alice, first.id)).toContainText('Owner handover: confirm the rota.');
    await open(bob);
    let second = await committed(bob, commentsPath, 'comments.create', async () => {
      await article(bob, first.id).getByRole('button', { name: 'Reply', exact: true }).click();
      await bob.page.getByRole('textbox', { name: 'Reply text', exact: true }).fill('Member handover: checking the rota.');
      await bob.page.getByRole('button', { name: 'Send comment', exact: true }).click();
    });
    assert.equal(second.threadId, first.threadId);
    const order = [first.id, second.id];
    const refuseOthers = async (person, other, own) => {
      await open(person);
      await expect(article(person, other.id).getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
      await expect(article(person, other.id).getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
      await expect(article(person, own.id).getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
      await expect(article(person, own.id).getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
      for (const change of [{ body: [{ text: 'Cross-author replacement' }] }, { delete: true }]) {
        const before = await snapshot();
        const result = await call(person.context, origin, 'PATCH', `/api/comments/${other.id}`, { operationKey: randomUUID(), expectedRevisionId: other.revisionId, ...change });
        assert.equal(result.status, 403);
        assert.equal(result.body.code, 'FORBIDDEN');
        refusals.push({ actorId: (await session(person)).id, commentId: other.id, change, result });
        assert.deepEqual(await snapshot(), before, 'Cross-author refusal preserves comments, threads and activity.');
      }
    };
    await refuseOthers(bob, first, second);
    await refuseOthers(alice, second, first); // Ownership grants no author override.

    for (const [person, original, text] of [[alice, first, 'Owner handover: rota confirmed.'], [bob, second, 'Member handover: next shift confirmed.']]) {
      await open(person);
      const edited = await committed(person, `/api/comments/${original.id}`, 'comments.edit', async () => {
        await article(person, original.id).getByRole('button', { name: 'Edit', exact: true }).click();
        await person.page.getByRole('textbox', { name: 'Edit comment text', exact: true }).fill(text);
        await person.page.getByRole('button', { name: 'Save comment', exact: true }).click();
      });
      assert.ok(Date.parse(edited.updatedAt) > Date.parse(edited.createdAt));
      await open(person); // Fresh loader, not the editor's optimistic state.
      await expect(article(person, edited.id)).toContainText(text);
      const time = article(person, edited.id).locator('small time');
      await expect(time).toHaveAttribute('datetime', edited.updatedAt);
      await expect(time).toBeVisible();
      await expect(time).toHaveText(await person.page.evaluate(value => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)), edited.updatedAt));
      if (person === alice) first = edited; else second = edited;
    }
    // Scroll the real panel so the sticky composer does not cover the proof.
    const showComments = async () => bob.page.locator('.right').evaluate((panel, id) => {
      const comment = window.document.getElementById(`comment-${id}`);
      panel.scrollTop += comment.getBoundingClientRect().top - panel.getBoundingClientRect().top - 16;
    }, first.id);
    await showComments();
    await expect(article(bob, second.id).locator('small time')).toBeInViewport({ ratio: 1 });
    await accessible(bob.page, 'COMM-002 edited comment after reload');
    const retainedEdits = await snapshot();
    for (const record of records.filter(item => item.action === 'comments.edit')) {
      const person = record.result.value.id === first.id ? alice : bob;
      assert.deepEqual(await ok(person.context, origin, 'PATCH', record.path, record.input), record.result);
      assert.deepEqual(await snapshot(), retainedEdits, 'Edit replay keeps the timestamp and exactly one activity entry.');
    }
    for (const [person, comment] of [[alice, first], [bob, second]]) {
      await open(person);
      await committed(person, `/api/comments/${comment.id}`, 'comments.delete', () => article(person, comment.id).getByRole('button', { name: 'Delete', exact: true }).click());
      await expect(article(person, comment.id)).toContainText('Comment deleted');
    }
    const deleted = await snapshot();
    assert.deepEqual(deleted.comments.comments.map(comment => comment.id), order, 'Tombstones retain both chronological positions.');
    assert.equal(deleted.comments.threads.length, 1);
    assert.equal(deleted.activity.length, 6, 'Each creation, edit and deletion contributes one activity entry.');
    for (const record of records) {
      const person = record.result.value.id === first.id ? alice : bob;
      assert.deepEqual(await ok(person.context, origin, record.action === 'comments.create' ? 'POST' : 'PATCH', record.path, record.input), record.result);
      assert.deepEqual(await snapshot(), deleted, 'Replaying old writes cannot resurrect a deleted comment or duplicate activity.');
    }
    for (const person of [alice, bob]) {
      await open(person);
      assert.deepEqual(await ok(person.context, origin, 'GET', commentsPath), deleted.comments);
      assert.deepEqual(await article(person, first.id).locator('..').locator('.comment').evaluateAll(items => items.map(item => item.id)), order.map(id => `comment-${id}`));
      for (const comment of [first, second]) {
        await expect(article(person, comment.id)).toContainText('Comment deleted');
        await expect(article(person, comment.id)).not.toContainText(comment.body[0].text);
        await expect(article(person, comment.id).getByRole('button', { name: /^(Edit|Delete)$/ })).toHaveCount(0);
      }
    }
    await showComments();
    for (const comment of [first, second]) await expect(article(bob, comment.id).getByText('Comment deleted', { exact: true })).toBeInViewport({ ratio: 1 });
    await accessible(bob.page, 'COMM-002 deletion tombstones after replay and reload');
    await mkdir('.artifacts/ui-convergence', { recursive: true });
    await writeFile(`.artifacts/ui-convergence/comments-${width}.json`, JSON.stringify({ pageId, width, members: members.map(member => ({ id: member.id, role: member.role })), records, refusals, retainedEdits, deleted }, null, 2));
    console.log(`PROBE COMM-002 acceptance 1–2: native comment controls and HTTP at ${width}px -> two authors edit/delete; cross-author and owner override 403; edited times, two in-place tombstones and six activities survive replay/reload`);
  });
}
