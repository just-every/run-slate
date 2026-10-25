import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, request } from '@playwright/test';
import { root } from '../../e2e/runtime-harness.mjs';

/**
 * Two signed-in people at once: the harness's owner context is Alex Owner, and a
 * second context in the same browser carries Morgan Reader's real native
 * session. Both drive the same emitted Worker; nothing is seeded beyond identity.
 */
export async function withSecondPerson(state, width, run) {
  const evidence = path.join(root, '.artifacts/ui-convergence/two-people', String(width));
  await mkdir(evidence, { recursive: true });
  const viewport = { width, height: width === 1440 ? 1000 : 844 };
  const context = await state.context.browser().newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'], locale: 'en-US' });
  await context.addCookies([{ name: 'slate_session', value: state.readerCookie.split('=')[1], url: state.origin }]);
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', cause => errors.push(String(cause)));
  const timings = {}, shots = [], refusals = [];
  // Every refused API call either person's browser made, for the evidence record.
  for (const [person, view] of [['alice', state.page], ['bob', page]]) view.on('response', response => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith('/api/') || response.status() < 400) return;
    const entry = { person, method: response.request().method(), path: url.pathname, status: response.status(), at: new Date().toISOString() };
    refusals.push(entry);
    response.json().then(body => { entry.code = body?.code; }, () => {});
  });
  let ordinal = 0;
  const people = {
    alice: { name: 'Alex Owner', page: state.page, context: state.context },
    bob: { name: 'Morgan Reader', page, context, id: 'browser-reader' },
    evidence, timings, errors,
    /** One screenshot per person per state, kept beside the measured times. */
    async shot(person, label) {
      const file = `${String(++ordinal).padStart(2, '0')}-${person}-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
      await people[person].page.screenshot({ path: path.join(evidence, file), fullPage: true });
      shots.push({ person, state: label, file });
    },
    record(name, value) { timings[name] = value; },
  };
  try {
    await run(people);
    assert.deepEqual(errors, [], 'Neither browser raised a page error.');
  } finally {
    await writeFile(path.join(evidence, 'measurements.json'), JSON.stringify({ width, timings, refusals, screenshots: shots, pageErrors: errors }, null, 2));
    await context.close();
  }
}

/** A mutation through the person's own session, as the browser would send it. */
export async function call(context, origin, method, route, data) {
  // Connection: close still lets Playwright select an already pooled socket.
  // Own and dispose the transport for each call, retaining the person's current
  // authentication without carrying idle connections across browser actions.
  const transport = await request.newContext({ storageState: await context.storageState() });
  try {
    const response = await transport.fetch(origin + route, { method, headers: { origin, 'content-type': 'application/json' }, data: data === undefined ? undefined : JSON.stringify(data), maxRetries: 0 });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
    return { status: response.status(), body };
  } finally {
    await transport.dispose();
  }
}

export async function ok(context, origin, method, route, data) {
  const result = await call(context, origin, method, route, data);
  assert.ok(result.status >= 200 && result.status < 300, `${method} ${route}: ${result.status} ${JSON.stringify(result.body).slice(0, 300)}`);
  return result.body;
}

/** A restricted page in the first space, holding known paragraph blocks. */
export async function restrictedPage({ context, origin }, title, lines) {
  const spaces = await ok(context, origin, 'GET', '/api/containers');
  const space = spaces.items.find(item => item.name === 'Handbook');
  const blocks = lines.map((text, index) => ({ id: randomUUID(), blockType: 'paragraph', content: { text: [{ text }] }, treePosition: `a${index}` }));
  const created = await ok(context, origin, 'POST', '/api/pages', { operationKey: randomUUID(), containerId: space.id, title, blocks });
  const pageId = created.value.pageId;
  // Restriction narrows traversal only, so the owner keeps the page through a direct grant.
  await grant(context, origin, pageId, 'browser-owner', 'full');
  const document = await ok(context, origin, 'GET', `/api/pages/${pageId}`);
  await ok(context, origin, 'PUT', `/api/sharing/pages/${pageId}/inheritance`, { operationKey: randomUUID(), expectedRevisionId: document.page.revisionId, restricted: true });
  return { pageId, blockIds: blocks.map(block => block.id), spaceId: space.id };
}

export async function grant(context, origin, pageId, principalId, level, extra = {}) {
  return ok(context, origin, 'POST', '/api/sharing', { operationKey: randomUUID(), targetKind: 'page', targetId: pageId, principalKind: 'member', principalId, level, ...extra });
}

export const editable = (page, blockId) => page.locator(`[data-block-id="${blockId}"] [contenteditable="true"]`);
export const blockText = (page, blockId) => page.locator(`[data-block-id="${blockId}"]`).first();

/** Puts the caret at the very end of a block, wherever its text wraps; End reaches only the end of the visual line. */
export async function caretAtEnd(page, blockId) {
  await editable(page, blockId).click();
  await editable(page, blockId).evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); range.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(range); });
}

/** Types at the very end of a block. */
export async function typeAtEnd(page, blockId, words) {
  await caretAtEnd(page, blockId);
  await page.keyboard.type(words);
}

/** Milliseconds until a condition holds, polling without changing the page. */
export async function elapsedUntil(check, { timeout, interval = 50, since = Date.now() } = {}) {
  for (;;) {
    if (await check()) return Date.now() - since;
    if (Date.now() - since > timeout) throw new Error(`Condition not met within ${timeout} ms`);
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

/**
 * SAVE-001: the time between the server's committed block response and the
 * page showing Saved. The page records when each status text first appears.
 */
export async function savedAfterCommit(page, blockId, edit) {
  await page.evaluate(id => {
    window.slateBlockStates?.observer.disconnect();
    const seen = [];
    const observe = () => {
      const text = document.querySelector(`.editor-save-status`)?.textContent ?? '';
      if (text && seen.at(-1)?.text !== text) seen.push({ text, at: Date.now() });
    };
    observe();
    const observer = new MutationObserver(observe);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.slateBlockStates = { observer, seen };
  }, blockId);
  const committed = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().includes(`/blocks/${blockId}`) && response.status() === 200, { timeout: 15000 });
  await edit();
  const response = await committed;
  const commitAt = Date.now(), body = await response.json();
  await expect(page.locator('.editor-save-status').filter({ hasText: /^Saved/ })).toBeVisible({ timeout: 2000 });
  const seen = await page.evaluate(() => window.slateBlockStates.seen);
  const saving = seen.find(item => /^Saving/.test(item.text)), saved = saving && seen.find(item => /^Saved/.test(item.text) && item.at >= saving.at);
  assert.ok(saving, 'The page shows Saving while the write is in flight.');
  assert.ok(saved, 'Saved follows Saving.');
  return { blockRevisionId: body.value.blockRevisionId, revisionId: body.value.revisionId, savingShownMs: saving.at, savedAfterCommitMs: Math.max(0, saved.at - commitAt) };
}
