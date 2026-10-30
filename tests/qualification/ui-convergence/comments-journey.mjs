import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { call, grant, ok, restrictedPage } from './two-people-support.mjs';
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

/** A comment-level member uses both native composers without content authority. */
export async function memberThreadsJourney(state, people) {
  const { page, context, origin, api } = state;
  const bob = people.bob.page;
  const { pageId, blockIds } = await restrictedPage(state, 'Shift review', ['The on-call lead owns escalation decisions.']);
  const access = await grant(context, origin, pageId, people.bob.id, 'comment');
  const route = `/api/comments/page/${pageId}`;
  const before = await api(`/api/pages/${pageId}`);
  const readable = await ok(people.bob.context, origin, 'GET', `/api/pages/${pageId}`);
  assert.equal(readable.permissions.level, 'comment');
  assert.equal(readable.permissions.canEdit, false);
  await bob.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
  await expect(bob.getByRole('textbox', { name: 'Page title', exact: true })).toHaveAttribute('readonly', '');
  const paragraph = bob.getByRole('textbox', { name: 'Paragraph', exact: true }).first();
  await expect(paragraph).toHaveAttribute('contenteditable', 'false');
  // Native browser selection, with no synthetic application event or write.
  await paragraph.evaluate(element => {
    element.focus();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const boundary = offset => {
      for (const node of nodes) {
        if (offset <= node.textContent.length) return [node, offset];
        offset -= node.textContent.length;
      }
      throw new Error('The selected text must exist in the rendered paragraph.');
    };
    const range = document.createRange();
    range.setStart(...boundary(4)); range.setEnd(...boundary(16));
    getSelection().removeAllRanges(); getSelection().addRange(range);
  });
  await bob.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(bob.locator('.comment-form blockquote')).toHaveText('on-call lead');
  const writes = [];
  async function send(view, text, reply = false) {
    await view.getByRole('textbox', { name: reply ? 'Reply text' : 'Comment text', exact: true }).fill(text);
    const response = view.waitForResponse(response => new URL(response.url()).pathname === route && response.request().method() === 'POST');
    await view.getByRole('button', { name: 'Send comment', exact: true }).click();
    const native = await response;
    assert.equal(native.status(), 200, await native.text());
    const result = await native.json();
    writes.push({text, result, input:native.request().postDataJSON()});
    await expect(view.locator(`#comment-${result.value.id}`)).toContainText(text);
    return result.value.threadId;
  }
  const inlineId = await send(bob, 'Please confirm this selected responsibility.');
  await expect(bob.locator('.comment-form blockquote')).toHaveCount(0);
  await closeDetails(bob);
  await bob.evaluate(() => getSelection().removeAllRanges());
  await openPageAction(bob, 'Comments');
  const pageThreadId = await send(bob, 'The whole handover needs a second review.');
  for (const [threadId, reply] of [[inlineId, 'Confirmed by the outgoing shift.'], [pageThreadId, 'The outgoing shift reviewed the whole page.']]) {
    await page.goto(`${origin}/app/pages/${pageId}`, { waitUntil: 'networkidle' });
    await openPageAction(page, 'Comments');
    await page.locator(`#thread-${threadId}`).getByRole('button', { name: 'Reply', exact: true }).first().click();
    await send(page, reply, true);
  }
  for (const [threadId, reply] of [[inlineId, 'The incoming shift accepts this responsibility.'], [pageThreadId, 'The incoming shift accepts the handover.']]) {
    await bob.reload({ waitUntil: 'networkidle' });
    await bob.locator(`#thread-${threadId}`).getByRole('button', { name: 'Reply', exact: true }).first().click();
    await send(bob, reply, true);
  }
  const canonical = await api(route);
  assert.equal(canonical.threads.length, 2);
  assert.equal(canonical.comments.length, 6);
  const inline = canonical.threads.find(thread => thread.id === inlineId);
  const whole = canonical.threads.find(thread => thread.id === pageThreadId);
  assert.equal(inline.kind, 'inline');
  assert.equal(inline.block_id, blockIds[0]);
  assert.equal(inline.anchor_revision_id, before.workingRevisionId);
  assert.deepEqual(JSON.parse(inline.anchor_json), {anchorId:writes[0].input.anchor.anchorId,quote:'on-call lead',start:4,end:16});
  assert.equal(inline.orphaned, 0);
  assert.equal(whole.kind, 'page');
  for (const key of ['block_id','anchor_json','anchor_revision_id']) assert.equal(whole[key], null);
  for (const threadId of [inlineId,pageThreadId]) {
    const rows = canonical.comments.filter(comment => comment.threadId === threadId);
    const expected = writes.filter(write => write.result.value.threadId === threadId);
    assert.deepEqual(rows.map(row => row.id), expected.map(write => write.result.value.id), 'Native chronological order matches the three actual sends.');
    assert.deepEqual(rows.map(row => row.body.map(span => span.text).join('')), expected.map(write => write.text));
    assert.deepEqual(rows.map(row => row.authorMemberId), [people.bob.id,'browser-owner',people.bob.id]);
    assert.deepEqual(rows.map(row => row.authorDisplayName), ['Morgan Reader','Alex Owner','Morgan Reader']);
    assert.ok(rows.every((row,index) => row.createdAt === expected[index].result.receipt.committedAt && row.updatedAt === row.createdAt));
    assert.ok(rows.every((row,index) => index === 0 || row.createdAt > rows[index-1].createdAt), 'Each later send has a later native timestamp.');
  }
  assert.deepEqual(await ok(people.bob.context, origin, 'GET', route), canonical, 'Both members read the same threads and attribution.');
  await bob.locator(`#thread-${inlineId}`).getByRole('button', { name: 'Resolve', exact: true }).click();
  await expect(bob.locator(`#thread-${inlineId} .thread-heading`)).toContainText('Resolved');
  const resolved = await api(route);
  assert.equal(resolved.threads.find(thread => thread.id === inlineId).state, 'resolved');
  assert.equal(resolved.threads.find(thread => thread.id === pageThreadId).state, 'open');
  for (const view of [bob,page]) {
    await view.reload({ waitUntil: 'networkidle' });
    await expect(view.locator('.comment-thread')).toHaveCount(2);
    for (const threadId of [inlineId,pageThreadId]) {
      const section = view.locator(`#thread-${threadId}`);
      const rows = canonical.comments.filter(comment => comment.threadId === threadId);
      assert.deepEqual(await section.locator('article').evaluateAll(articles => articles.map(article => article.id)), rows.map(row => `comment-${row.id}`));
      for (const row of rows) {
        const article = section.locator(`#comment-${row.id}`);
        await expect(article.locator('header strong')).toHaveText(row.authorDisplayName);
        await expect(article.locator('header time')).toHaveAttribute('datetime', row.createdAt);
        await expect(article.locator('header time')).toHaveText(/\S/);
        await expect(article.locator(':scope > p')).toHaveText(row.body.map(span => span.text).join(''));
      }
      await expect(section.locator('.thread-heading > span')).toHaveText(threadId === inlineId ? 'Resolved' : 'Open');
    }
    await expect(view.locator(`#thread-${inlineId} blockquote`)).toHaveText('on-call lead');
    await expect(view.locator(`[data-block-id="${blockIds[0]}"] mark`)).toHaveText('on-call lead');
    await expect(view.locator(`#thread-${inlineId}`).getByRole('button', { name: 'Jump to selected text', exact: true })).toBeVisible();
    await expect(view.locator(`#thread-${pageThreadId} blockquote`)).toHaveCount(0);
  }
  assert.deepEqual((await api(route)).comments, canonical.comments, 'Resolving and reloading retain all comments, authors and timestamps.');
  await bob.screenshot({path:`.artifacts/ui-convergence/member-threads-${bob.viewportSize().width}.png`,fullPage:true});
  // A valid comment selector annotates the read projection, never durable page content.
  const after = await api(`/api/pages/${pageId}`);
  assert.equal(after.page.revisionId, before.page.revisionId);
  assert.equal(after.workingRevisionId, before.workingRevisionId);
  assert.equal(after.permissions.canEdit, true);
  await expect(bob.getByRole('textbox', { name: 'Paragraph', exact: true }).first()).toHaveAttribute('contenteditable','false');
  const denied = [
    ['PATCH',`/api/pages/${pageId}`,{expectedRevisionId:after.page.revisionId,properties:{title:'Unauthorized title'}}],
    ['PATCH',`/api/pages/${pageId}/blocks/${blockIds[0]}`,{expectedRevisionId:after.blocks[0].revisionId,content:{text:[{text:'Unauthorized body'}]}}],
    ['PUT',`/api/pages/${pageId}/blocks`,{expectedRevisionId:after.page.revisionId,blocks:[]}],
  ];
  for (const [method,path,input] of denied) {
    const refusal = await call(people.bob.context,origin,method,path,{operationKey:crypto.randomUUID(),...input});
    assert.equal(refusal.status,404,'Insufficient page authority uses the native non-disclosure response.');
    assert.equal(refusal.body.code,'NOT_FOUND');
  }
  const forged = await call(people.bob.context,origin,'POST',route,{...writes[0].input,operationKey:crypto.randomUUID(),anchor:{...writes[0].input.anchor,quote:'Unselected text'}});
  assert.equal(forged.status,409,'An anchor cannot claim text outside the actual readable selection.');
  assert.deepEqual(await api(route), resolved, 'Refused content writes and invalid anchors change no discussion.');
  assert.deepEqual(await api(`/api/pages/${pageId}`), after, 'Comment authority cannot change the page.');
  await grant(context,origin,pageId,people.bob.id,'view',{id:access.value.id});
  for (const input of [writes[0].input,writes[1].input,{operationKey:crypto.randomUUID(),threadId:inlineId,body:[{text:'Refused reply'}]}]) {
    const refusal = await call(people.bob.context,origin,'POST',route,input);
    assert.equal(refusal.status,404,'Downgraded access refuses both new comments and replay.');
    assert.equal(refusal.body.code,'NOT_FOUND');
  }
  assert.deepEqual(await api(route),resolved,'A replay cannot recreate comments after comment authority is removed.');
  console.log(`PROBE COMM-001 1: native comment route and rendered discussion -> six chronological comments with exact native author and timestamp at ${bob.viewportSize().width}px`);
  console.log(`PROBE COMM-001 2: native selection and page composers -> inline anchor retained, page anchor absent, replies and persisted Open and Resolved states at ${bob.viewportSize().width}px`);
  console.log(`PROBE COMM-001 3: comment-level session -> both thread kinds allowed; page edits, forged selection and revoked comment replay refused without changing state at ${bob.viewportSize().width}px`);
}
