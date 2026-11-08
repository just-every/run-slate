import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {expect} from '@playwright/test';
import {accessible} from './browser-evidence.mjs';
import {call, grant, ok, restrictedPage, withSecondPerson} from './two-people-support.mjs';

/** Native proposal editing, retained snapshots and authority in the default product. */
export async function decisionEditJourney(state, width) {
  await state.switchIdentity('owner');
  const {context, origin} = state;
  const read = route => ok(context, origin, 'GET', route);
  assert.deepEqual(await read('/api/profile'), {profile: 'core-wiki'});
  await withSecondPerson(state, width, async ({bob}) => {
    const host = await restrictedPage(state, 'Proposal editing procedure', ['Retained underlying page content']);
    const editorGrant = await grant(context, origin, host.pageId, bob.id, 'edit');
    const owner = (await read('/api/members/current')).id;
    const evidence = await ok(context, origin, 'POST', '/api/pages', {operationKey: crypto.randomUUID(), containerId: host.spaceId, title: 'Proposal supporting evidence'});
    const source = await read('/api/pages/' + evidence.value.pageId);
    await grant(context, origin, source.page.id, bob.id, 'view');
    const hostBefore = await read('/api/pages/' + host.pageId);
    const created = await ok(context, origin, 'POST', '/api/decisions', {
      operationKey: crypto.randomUUID(), pageId: host.pageId, question: 'Which procedure?', options: ['First', 'Second'],
      outcome: '', rationale: '', ownerId: owner, decidedAt: null, reviewAt: null, citations: [],
    });
    const id = created.value.id, route = '/api/decisions/' + id;
    const view = bob.page, article = view.locator('#decision-' + id);
    const snapshots = [], receipts = [created], refusals = [];
    const history = async () => (await read(route + '/history')).items;
    const activity = async () => (await read('/api/activity?action=decisions.save&limit=100')).items.filter(item => item.target.id === id);
    const stored = async () => ({decision: await read(route), history: await history(), activity: await activity()});
    const open = async () => {
      await view.goto(origin + '/app/decisions/' + id, {waitUntil: 'networkidle'});
      await view.reload({waitUntil: 'networkidle'});
    };
    const proposal = async () => {
      const details = article.locator('details').filter({has: view.locator('summary', {hasText: /^Choose the outcome$/})});
      if (!await details.getAttribute('open').then(value => value !== null)) await details.locator(':scope > summary').click();
      const fields = details.locator('details').filter({has: view.locator('summary', {hasText: 'Question, owner, dates & evidence'})});
      if (!await fields.getAttribute('open').then(value => value !== null)) await fields.locator(':scope > summary').click();
      return details;
    };
    const submit = async form => {
      const response = view.waitForResponse(response => new URL(response.url()).pathname === '/api/decisions' && response.request().method() === 'POST');
      await form.getByRole('button', {name: 'Save proposed decision', exact: true}).click();
      const result = await response;
      const request = result.request().postDataJSON(), body = await result.json();
      await expect(form.getByRole('button', {name: 'Save proposed decision', exact: true})).toBeEnabled();
      return {status: result.status(), request, body};
    };
    await open();
    const initial = await read(route);
    const pendingBefore = await stored();
    await expect(article.getByRole('button', {name:'Accept decision',exact:true})).toHaveCount(0);
    assert.equal(await (await proposal()).locator('form').evaluate(form => form.checkValidity()), true, 'A pending outcome and rationale are valid Proposed drafts.');
    const pendingUnchanged = await submit(await proposal());
    assert.equal(pendingUnchanged.status, 200);
    assert.equal(pendingUnchanged.body.receipt.unchanged, true);
    assert.equal(pendingUnchanged.body.receipt.activityId, null);
    assert.deepEqual(await stored(), pendingBefore, 'A pending outcome does not prevent an identical resubmit.');
    receipts.push(pendingUnchanged);
    snapshots.push({revisionId: initial.revision_id, content: initial.content, actorId: owner, committedAt: created.receipt.committedAt});
    const changes = [
      ['question', async form => form.getByLabel('Question', {exact: true}).fill('Which revised procedure?'), 'Which revised procedure?'],
      ['options', async form => form.getByLabel('Options considered').fill('Second\nThird'), ['Second', 'Third']],
      ['outcome', async form => form.getByPlaceholder('Which outcome should this decision record?').fill('Third'), 'Third'],
      ['rationale', async form => form.getByLabel('Why this choice?').fill('Revised reasoning'), 'Revised reasoning'],
      ['ownerId', async form => form.getByLabel('Decision owner').selectOption(bob.id), bob.id],
      ['decidedAt', async form => form.getByLabel('Decided date').fill('2026-10-18'), '2026-10-18T00:00:00.000Z'],
      ['reviewAt', async form => form.getByLabel('Next review', {exact: true}).fill('2099-02-01'), '2099-02-01T00:00:00.000Z'],
      ['citations', async form => {
        await form.getByLabel('Add a page as evidence').selectOption(source.page.id);
        await form.getByRole('button', {name: 'Add current revision', exact: true}).click();
        await expect(form.getByText('1 exact reference retained.', {exact: true})).toBeVisible();
      }, [{kind: 'page', sourceId: source.page.id, revisionId: source.workingRevisionId}]],
    ];
    const commit = async (field, edit, value) => {
      const before = await stored(), form = await proposal();
      await edit(form);
      const saved = await submit(form);
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
      const {receipt} = saved.body;
      assert.equal(receipt.unchanged, undefined);
      assert.equal(receipt.operationKey, saved.request.operationKey);
      assert.equal(receipt.revisionId, saved.body.value.revisionId);
      assert.notEqual(receipt.revisionId, before.decision.revision_id);
      assert.deepEqual(receipt.entity, {id, kind: 'decision', revisionId: receipt.revisionId});
      const after = await stored();
      assert.deepEqual(after.decision.content[field], value);
      assert.equal(after.decision.revision_id, receipt.revisionId);
      assert.equal(after.history.length, before.history.length + 1, field + ' creates exactly one revision');
      const added = after.history.filter(item => !before.history.some(old => old.id === item.id));
      assert.equal(added.length, 1);
      assert.equal(added[0].entity_kind, 'decision');
      assert.equal(added[0].actor_id, bob.id);
      assert.equal(added[0].created_at, receipt.committedAt);
      assert.equal(added[0].id, receipt.revisionId);
      assert.deepEqual(added[0].content, saved.request);
      assert.equal(after.activity.length, before.activity.length + 1);
      const event = after.activity.find(item => item.id === receipt.activityId);
      assert.ok(event);
      assert.equal(event.actor.id, bob.id);
      assert.equal(event.occurredAt, receipt.committedAt);
      assert.equal(event.operationKey, receipt.operationKey);
      receipts.push(saved);
      snapshots.push({revisionId: receipt.revisionId, content: saved.request, actorId: bob.id, committedAt: receipt.committedAt});
      await open();
      const reloaded = await proposal();
      await expect(reloaded.getByLabel('Question', {exact: true})).toHaveValue(after.decision.content.question);
      await expect(reloaded.getByLabel('Options considered')).toHaveValue(after.decision.content.options.join('\n'));
      await expect(reloaded.getByPlaceholder('Which outcome should this decision record?')).toHaveValue(after.decision.content.outcome);
      await expect(reloaded.getByLabel('Why this choice?')).toHaveValue(after.decision.content.rationale);
      await expect(reloaded.getByLabel('Decision owner')).toHaveValue(after.decision.content.ownerId);
      await expect(reloaded.getByLabel('Decided date')).toHaveValue(after.decision.content.decidedAt?.slice(0, 10) ?? '');
      await expect(reloaded.getByLabel('Next review', {exact: true})).toHaveValue(after.decision.content.reviewAt?.slice(0, 10) ?? '');
    };
    for (const change of changes) await commit(...change);
    // Hand acceptance back to the appointed owner using the same native edit door.
    await commit('ownerId', form => form.getByLabel('Decision owner').selectOption(owner), owner);
    const beforeNoop = await stored();
    await proposal();
    await accessible(view, 'decision proposal native edit controls');
    const unchanged = await submit(await proposal());
    assert.equal(unchanged.status, 200);
    assert.equal(unchanged.body.receipt.unchanged, true);
    assert.equal(unchanged.body.receipt.activityId, null);
    assert.equal(unchanged.body.receipt.revisionId, beforeNoop.decision.revision_id);
    assert.deepEqual(await stored(), beforeNoop, 'Identical native resubmit changes no decision, revision or activity');
    receipts.push(unchanged);
    // The native stale door is an earlier, genuine captured browser request.
    const capture = receipts[1].request;
    const stale = await call(bob.context, origin, 'POST', '/api/decisions', {...capture, operationKey: crypto.randomUUID(), outcome: 'Stale overwrite'});
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'REVISION_CONFLICT');
    assert.deepEqual(await stored(), beforeNoop);
    refusals.push({name: 'stale revision', ...stale});
    const verifyHistory = async () => {
      await open();
      const details = view.locator('details').filter({has: view.locator('summary', {hasText: /^Decision history and reviews$/})});
      await details.locator(':scope > summary').click();
      const rows = await history();
      const links = details.locator('li a');
      await expect(links).toHaveCount(rows.length);
      assert.deepEqual(await links.evaluateAll(items => items.map(item => item.getAttribute('href'))), rows.map(item => `/app/decisions/${id}?revision=${item.id}`));
      for (const row of rows) {
        const line = details.locator('li').filter({has: view.locator(`a[href="/app/decisions/${id}?revision=${row.id}"]`)});
        await expect(line).toContainText(row.actor_id === owner ? 'Alex Owner' : 'Morgan Reader');
        await expect(line).toContainText(await view.evaluate(time => new Date(time).toLocaleString(), row.created_at));
      }
      return details;
    };
    await verifyHistory();
    await accessible(view, 'decision proposal retained history');
    for (const snapshot of snapshots) {
      await view.goto(origin + `/app/decisions/${id}?revision=${snapshot.revisionId}`, {waitUntil: 'networkidle'});
      await view.reload({waitUntil: 'networkidle'});
      const selected = await ok(bob.context, origin, 'GET', route + '?revision=' + snapshot.revisionId);
      assert.deepEqual(selected.content, snapshot.content);
      assert.equal(selected.revision.actorId, snapshot.actorId);
      assert.equal(selected.revision.createdAt, snapshot.committedAt);
      await expect(article.getByRole('heading', {name: snapshot.content.question, exact: true})).toBeVisible();
      await expect(article.locator(':scope > p').nth(1)).toHaveText(snapshot.content.outcome);
      await expect(article.locator(':scope > p').nth(2)).toHaveText(snapshot.content.rationale);
      if (snapshot.content.outcome) await expect(article.locator(':scope > p').nth(1)).toBeVisible();
      if (snapshot.content.rationale) await expect(article.locator(':scope > p').nth(2)).toBeVisible();
      await expect(article.getByRole('button', {name: 'Save proposed decision', exact: true})).toHaveCount(0);
      const metadata = article.getByRole('definition');
      await expect(metadata).toHaveText([snapshot.content.ownerId === owner ? 'Alex Owner' : 'Morgan Reader', snapshot.content.decidedAt?.slice(0, 10) ?? 'Not set', snapshot.content.reviewAt?.slice(0, 10) ?? 'Not set']);
      await article.getByText('Options & supporting sources', {exact: true}).click();
      assert.deepEqual(await article.locator('details').first().locator('ul > li').allTextContents(), snapshot.content.options);
      await expect(article.locator('details').first().locator('.evidence-reference')).toHaveCount(snapshot.content.citations.length);
    }
    // Downgrading the editor must remove the proposal controls and reject captures.
    await grant(context, origin, host.pageId, bob.id, 'view', {id: editorGrant.value.id});
    const viewOnlyBefore = await stored();
    await verifyHistory();
    await expect(article.getByText('Choose the outcome', {exact: true})).toHaveCount(0);
    await expect(view.getByRole('button', {name: 'Remove decision layer', exact: true})).toHaveCount(0);
    const viewOnly = await call(bob.context, origin, 'POST', '/api/decisions', {...capture, operationKey: crypto.randomUUID(), expectedRevisionId: viewOnlyBefore.decision.revision_id, question: 'Forbidden overwrite'});
    assert.equal(viewOnly.status, 404);
    assert.equal(viewOnly.body.code, 'NOT_FOUND');
    assert.deepEqual(await stored(), viewOnlyBefore);
    refusals.push({name: 'view only', ...viewOnly});
    await accessible(view, 'decision proposal view only');
    await grant(context, origin, host.pageId, bob.id, 'edit', {id: editorGrant.value.id});
    await state.page.goto(origin + '/app/decisions/' + id, {waitUntil: 'networkidle'});
    const accepting = state.page.waitForResponse(response => new URL(response.url()).pathname === route + '/accept' && response.request().method() === 'POST');
    await state.page.getByRole('button', {name: 'Accept decision', exact: true}).click();
    const acceptedResponse = await accepting;
    assert.equal(acceptedResponse.status(), 200);
    const accepted = await acceptedResponse.json();
    receipts.push({name: 'appointed owner accepts', body: accepted});
    const acceptedBefore = await stored();
    assert.equal(acceptedBefore.decision.state, 'accepted');
    assert.equal(acceptedBefore.decision.acceptedRevisionId, accepted.receipt.revisionId);
    await verifyHistory();
    await expect(article.getByText('Choose the outcome', {exact: true})).toHaveCount(0);
    // Each editable field is separately refused after acceptance, with identical history.
    const forbiddenChanges = {question: 'Cannot revise acceptance', options: ['Forbidden option'], outcome: 'First', rationale: 'Forbidden reasoning', ownerId: bob.id, decidedAt: '2026-10-19T00:00:00.000Z', reviewAt: '2099-03-01T00:00:00.000Z', citations: []};
    for (const [actor, actorContext] of [['editor', bob.context], ['appointed owner', context]]) {
      const changes = [['unchanged resubmit', {}], ...Object.entries(forbiddenChanges).map(([field, value]) => [field, {[field]: value}])];
      for (const [field, change] of changes) {
        const attempt = await call(actorContext, origin, 'POST', '/api/decisions', {...unchanged.request, id, operationKey: crypto.randomUUID(), expectedRevisionId: acceptedBefore.decision.revision_id, ...change});
        assert.equal(attempt.status, 409);
        assert.equal(attempt.body.code, 'IMMUTABLE_DECISION');
        assert.deepEqual(await stored(), acceptedBefore);
        refusals.push({name: 'accepted ' + actor + ' ' + field, ...attempt});
      }
    }
    await verifyHistory();
    assert.deepEqual((await read('/api/pages/' + host.pageId)).blocks, hostBefore.blocks);
    await accessible(view, 'accepted decision retains immutable history');
    const directory = path.join('.artifacts/ui-convergence/decision-edit', String(width));
    await mkdir(directory, {recursive: true});
    await writeFile(path.join(directory, 'receipts.json'), JSON.stringify({width, profile: 'core-wiki', artifact: JSON.parse(await readFile('.cache/slate/build-source.json', 'utf8')), id, receipts, snapshots, refusals, final: acceptedBefore}, null, 2));
    await view.goto('about:blank');
    await state.page.goto('about:blank');
    await ok(context, origin, 'POST', route + '/remove', {operationKey: crypto.randomUUID(), expectedRevisionId: acceptedBefore.decision.revision_id});
  });
  await state.page.goto('about:blank');
}
