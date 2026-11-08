import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import { root } from '../../e2e/runtime-harness.mjs';
import { accessible } from './browser-support.mjs';
import { call, grant, ok, restrictedPage, savedAfterCommit } from './two-people-support.mjs';

/** Native decisions in the default product: retained content, current warnings and exact lineage. */
export async function decisionImmutabilityJourney(state, people) {
  const { alice, bob } = people, { origin } = state;
  const returnUrl = alice.page.url();
  const width = alice.page.viewportSize().width;
  const directory = path.join(root, '.artifacts/ui-convergence/decisions', String(width));
  await mkdir(directory, { recursive: true });
  const read = route => ok(alice.context, origin, 'GET', route);
  const sources = [];
  for (const [index, title] of ['Original support plan', 'Original fallback plan'].entries()) {
    const source = await restrictedPage(state, title, [`Retained source ${index + 1}.`]);
    await grant(alice.context, origin, source.pageId, bob.id, 'edit');
    const document = await read(`/api/pages/${source.pageId}`);
    sources.push({ kind: 'page', sourceId: source.pageId, revisionId: document.workingRevisionId });
  }
  const decisionPage = await restrictedPage(state, 'Support plan decision', []);
  await grant(alice.context, origin, decisionPage.pageId, bob.id, 'view');
  const draft = { question: 'Which support plan should ship?', options: ['Primary', 'Fallback'], outcome: 'Primary', rationale: 'The exact two source revisions support this choice.' };
  await alice.page.goto(`${origin}/app/pages/${decisionPage.pageId}`, { waitUntil: 'networkidle' });
  await alice.page.getByRole('button', { name: 'More', exact: true }).click();
  await alice.page.getByRole('menuitem', { name: 'Add decision record', exact: true }).click();
  const dialog = alice.page.getByRole('dialog', { name: 'Add a decision to this page' });
  await dialog.getByLabel('Question', { exact: true }).fill(draft.question);
  await dialog.getByLabel('Options considered').fill(draft.options.join('\n'));
  await dialog.getByLabel('Proposed outcome').fill(draft.outcome);
  await dialog.getByLabel('Rationale', { exact: true }).fill(draft.rationale);
  for (const ref of sources) {
    await dialog.getByLabel('Add a page as evidence').selectOption(ref.sourceId);
    await dialog.getByRole('button', { name: 'Add current revision', exact: true }).click();
    await expect(dialog.getByLabel('Add a page as evidence')).toHaveValue('');
  }
  await dialog.getByRole('button', { name: 'Create proposed decision', exact: true }).click();
  await alice.page.waitForURL(/\/app\/decisions\//);
  const id = new URL(alice.page.url()).pathname.split('/').at(-1);
  const receiptOn = (page, route) => page.waitForResponse(response => new URL(response.url()).pathname === route && response.request().method() === 'POST');
  const acceptance = receiptOn(alice.page, `/api/decisions/${id}/accept`);
  await alice.page.getByRole('button', { name: 'Accept decision', exact: true }).click();
  const acceptanceResponse = await acceptance;
  assert.equal(acceptanceResponse.status(), 200);
  const acceptedReceipt = await acceptanceResponse.json();
  await expect(alice.page.getByRole('button', { name: 'Prepare a replacement decision', exact: true })).toBeVisible();
  const accepted = await read(`/api/decisions/${id}`);
  assert.deepEqual(accepted.content.citations, sources);
  for (const key of ['question', 'options', 'outcome', 'rationale']) assert.deepEqual(accepted.content[key], draft[key]);
  assert.equal(accepted.acceptedRevisionId, acceptedReceipt.receipt.revisionId);
  assert.equal(accepted.citationsCurrent, true);

  async function visibleSnapshot(page, record, { stale = false } = {}) {
    const card = page.locator(`#decision-${record.id}`);
    await expect(card.getByRole('heading', { name: record.content.question, exact: true })).toBeVisible();
    await expect(card.getByText(record.content.outcome, { exact: true }).first()).toBeVisible();
    await expect(card.getByText(record.content.rationale, { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Save proposed decision', exact: true })).toHaveCount(0);
    if (stale) await expect(card.getByRole('alert')).toContainText('Supporting evidence has changed.');
    await card.getByText('Options & supporting sources', { exact: true }).click();
    for (const option of record.content.options) await expect(card.locator('ul').first().getByText(option, { exact: true })).toBeVisible();
    for (const [index, ref] of record.content.citations.entries()) {
      const source = card.locator(`#decision-${record.id}-source-${index + 1}`);
      await source.locator(':scope > summary').click();
      await source.getByText('Reference details', { exact: true }).click();
      await expect(source.getByText(`Revision ${ref.revisionId}`, { exact: true })).toBeVisible();
    }
  }
  await visibleSnapshot(alice.page, accepted);
  await bob.page.goto(`${origin}/app/pages/${sources[0].sourceId}`, { waitUntil: 'networkidle' });
  const editReceipt = await savedAfterCommit(bob.page, undefined, async () => {
    const title = bob.page.getByRole('textbox', { name: 'Page title', exact: true });
    await title.fill('Revised support plan');
    await title.press('Tab');
  });
  await bob.page.reload({ waitUntil: 'networkidle' });
  await expect(bob.page.getByRole('textbox', { name: 'Page title', exact: true })).toHaveValue('Revised support plan');
  const stale = await read(`/api/decisions/${id}`);
  assert.equal(stale.citationsCurrent, false);
  assert.deepEqual(stale.content, accepted.content);
  assert.equal(stale.accepted_snapshot_json, accepted.accepted_snapshot_json);
  assert.equal(stale.acceptedRevisionId, accepted.acceptedRevisionId);
  await alice.page.reload({ waitUntil: 'networkidle' });
  await visibleSnapshot(alice.page, accepted, { stale: true });
  await accessible(alice.page, 'accepted decision with changed evidence');

  const activityEntries = async () => {
    const items = [];
    let cursor;
    do {
      const result = await read(`/api/activity?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      items.push(...result.items);
      cursor = result.nextCursor;
    } while (cursor);
    return items;
  };
  const inventory = async () => ({ decision: await read(`/api/decisions/${id}`), history: await read(`/api/decisions/${id}/history`), activity: await activityEntries() });
  const beforeRefusal = await inventory();
  const refused = await call(alice.context, origin, 'POST', '/api/decisions', {
    operationKey: crypto.randomUUID(), id, pageId: accepted.page_id, expectedRevisionId: stale.revision_id,
    ...draft, question: 'Attempted accepted rewrite', ownerId: accepted.owner_member_id,
    decidedAt: accepted.decided_at, reviewAt: accepted.review_at, citations: sources,
  });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, 'IMMUTABLE_DECISION');
  assert.deepEqual(await inventory(), beforeRefusal, 'Refused edits change neither accepted data, history nor activity.');
  await alice.page.goto(`${origin}/app/decisions`, { waitUntil: 'networkidle' });
  const logEntry = alice.page.locator('.settings-list li').filter({ hasText: draft.question });
  await expect(logEntry).toContainText('Evidence changed');
  await logEntry.getByRole('link', { name: new RegExp(draft.question.replace('?', '\\?')) }).click();
  await alice.page.waitForURL(url => url.pathname === `/app/decisions/${id}` && url.searchParams.get('revision') === accepted.acceptedRevisionId);
  await visibleSnapshot(alice.page, accepted, { stale: true });
  await alice.page.goto(`${origin}/app/decisions/${id}`, { waitUntil: 'networkidle' });

  // Read the genuine receipt before the control navigates away and Chromium
  // discards its body buffer. The Worker and delivered response are unchanged.
  const preparationPath = `/api/decisions/${id}/propose-successor`;
  const matchesPreparation = url => url.pathname === preparationPath;
  let preparedReceipt;
  const capturePreparation = async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch({ maxRetries: 0 });
    assert.equal(response.status(), 200, await response.text());
    preparedReceipt = await response.json();
    await route.fulfill({ response });
  };
  await alice.page.route(matchesPreparation, capturePreparation);
  try {
    await alice.page.getByRole('button', { name: 'Prepare a replacement decision', exact: true }).click();
    await expect.poll(() => !!preparedReceipt).toBe(true);
  } finally {
    await alice.page.unroute(matchesPreparation, capturePreparation);
  }
  const nextId = preparedReceipt.value.id;
  await alice.page.waitForURL(url => url.pathname === `/app/decisions/${nextId}`);
  await alice.page.getByLabel('Decision', { exact: true }).fill('Fallback');
  await alice.page.getByLabel('Why this choice?').fill('Current evidence changes the choice.');
  await alice.page.getByText('Question, owner, dates & evidence', { exact: true }).click();
  await alice.page.getByLabel('Question', { exact: true }).fill('Which revised support plan should ship?');
  for (let remaining = sources.length; remaining > 0; remaining--) await alice.page.getByRole('button', { name: 'Remove reference 1', exact: true }).click();
  const currentSources = [];
  for (const ref of sources) {
    currentSources.push({ ...ref, revisionId: (await read(`/api/pages/${ref.sourceId}`)).workingRevisionId });
    await alice.page.getByLabel('Add a page as evidence').selectOption(ref.sourceId);
    await alice.page.getByRole('button', { name: 'Add current revision', exact: true }).click();
    await expect(alice.page.getByLabel('Add a page as evidence')).toHaveValue('');
  }
  const save = receiptOn(alice.page, '/api/decisions');
  await alice.page.getByRole('button', { name: 'Save proposed decision', exact: true }).click();
  const saveResponse = await save;
  assert.equal(saveResponse.status(), 200, await saveResponse.text());
  await expect(alice.page.getByRole('button', { name: 'Accept decision', exact: true })).toBeEnabled();
  const supersession = receiptOn(alice.page, `/api/decisions/${nextId}/accept`);
  await alice.page.getByRole('button', { name: 'Accept decision', exact: true }).click();
  const supersessionResponse = await supersession;
  assert.equal(supersessionResponse.status(), 200, await supersessionResponse.text());
  const supersessionReceipt = await supersessionResponse.json();
  const later = await read(`/api/decisions/${nextId}`), earlier = await read(`/api/decisions/${id}`);
  assert.equal(earlier.state, 'superseded');
  assert.equal(earlier.superseded_by_decision_id, nextId);
  assert.deepEqual(earlier.content, accepted.content);
  assert.equal(earlier.accepted_snapshot_json, accepted.accepted_snapshot_json);
  assert.equal(later.content.supersedesId, id);
  assert.deepEqual(later.content.citations, currentSources);
  assert.equal(later.citationsCurrent, true);
  assert.notEqual(currentSources[0].revisionId, sources[0].revisionId);
  await alice.page.reload({ waitUntil: 'networkidle' });
  await visibleSnapshot(alice.page, later);
  await accessible(alice.page, 'replacement decision with earlier lineage');
  await alice.page.getByRole('link', { name: `Read the earlier decision: ${draft.question}`, exact: true }).click();
  await alice.page.waitForURL(url => url.pathname === `/app/decisions/${id}`);
  await visibleSnapshot(alice.page, accepted, { stale: true });
  await accessible(alice.page, 'earlier decision with replacement lineage');
  await alice.page.getByRole('link', { name: `Read the replacement decision: ${later.question}`, exact: true }).click();
  await alice.page.waitForURL(url => url.pathname === `/app/decisions/${nextId}`);
  await expect(alice.page.locator(`#decision-${nextId}`).getByRole('heading', { name: later.question, exact: true })).toBeVisible();

  // Restrict only the replacement; the earlier record remains readable to Morgan.
  const replacementPage = await read(`/api/pages/${later.page_id}`);
  await ok(alice.context, origin, 'PUT', `/api/sharing/pages/${later.page_id}/inheritance`, { operationKey: crypto.randomUUID(), expectedRevisionId: replacementPage.page.revisionId, restricted: true });
  const denied = await call(bob.context, origin, 'GET', `/api/decisions/${nextId}`);
  assert.equal(denied.status, 404);
  assert.ok(!JSON.stringify(denied.body).includes(later.question));
  await bob.page.goto(`${origin}/app/decisions/${id}`, { waitUntil: 'networkidle' });
  await expect(bob.page.getByText('The linked decision is unavailable with current access.', { exact: true })).toBeVisible();
  await expect(bob.page.getByText(later.question, { exact: true })).toHaveCount(0);
  await expect(bob.page.getByRole('link', { name: /^Read the replacement decision:/ })).toHaveCount(0);
  await accessible(bob.page, 'unavailable replacement discloses no question');
  await bob.page.reload({ waitUntil: 'networkidle' });
  await expect(bob.page.getByText('The linked decision is unavailable with current access.', { exact: true })).toBeVisible();
  await expect(bob.page.getByText(later.question, { exact: true })).toHaveCount(0);
  assert.deepEqual((await read(`/api/decisions/${id}?revision=${accepted.acceptedRevisionId}`)).content, accepted.content);
  console.log(`PROBE DEC-003 1: core-wiki at ${width}px -> stale card and log warnings, unchanged accepted content, immutable edit refusal, current replacement acceptance, both exact lineage links and restricted replacement without a question`);
  console.log(`PROBE DEC-003 2: native acceptance at ${width}px -> two exact cited revisions frozen; another member's edit leaves the complete accepted snapshot unchanged through API, UI and reload`);
  await writeFile(path.join(directory, 'receipts.json'), JSON.stringify({ width, acceptedReceipt, editReceipt, preparedReceipt, supersessionReceipt, accepted, stale, earlier, later, refused, denied }, null, 2));
  await alice.page.goto(returnUrl, { waitUntil: 'networkidle' });
}
