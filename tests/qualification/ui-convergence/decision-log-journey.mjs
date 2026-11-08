import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {expect} from '@playwright/test';
import {decisionLogCorpus, assertDecisionMembership} from '../../helpers/decision-log-corpus.ts';
import {decisionChecks} from '../interface/decisions.mjs';
import {accessible} from './browser-evidence.mjs';
import {call, ok, withSecondPerson} from './two-people-support.mjs';

/** Populated core-wiki log through real filters, native projections and retained links. */
export async function decisionLogJourney(state, width) {
  const {page, context, origin, api} = state;
  await state.switchIdentity('owner');
  assert.deepEqual(await api('/api/profile'), {profile: 'core-wiki'});
  // Load the earlier manual-layer assertions in Verify without duplicating or
  // weakening creation, proposal history, acceptance, reviews or removal.
  const handbook = (await api('/api/containers')).items.find(item => item.name === 'Handbook').id;
  const manual = await ok(context, origin, 'POST', '/api/pages', {operationKey: crypto.randomUUID(), containerId: handbook, title: 'Manual decision proof'});
  await decisionChecks({page, context, runtime: {origin}, id: manual.value.pageId, check() {}});
  await page.goto('about:blank');
  await withSecondPerson(state, width, async ({bob}) => {
    const owner = (await api('/api/members/current')).id;
    const request = (actor, method, route, body) => ok(actor === 'owner' ? context : bob.context, origin, method, route, body);
    const corpus = await decisionLogCorpus(request, owner, bob.id);
    const {rows, cases} = corpus;
    const view = bob.page;
    const entries = view.locator('.settings-list > li > a:first-child');
    const expectedHrefs = keys => keys.map(key => rows[key].acceptedRevisionHref ?? '/app/decisions/' + rows[key].id).sort();
    const checkList = async (scenario, projected) => {
      assertDecisionMembership(projected.items, rows, scenario.keys, scenario.name);
      await expect(entries).toHaveCount(scenario.keys.length);
      assert.deepEqual((await entries.evaluateAll(links => links.map(link => link.getAttribute('href')))).sort(), expectedHrefs(scenario.keys), scenario.name + ' visible exact membership');
      assert.deepEqual((await entries.locator('strong').allTextContents()).sort(), scenario.keys.map(key => 'Decision ' + key).sort(), scenario.name + ' visible questions');
      for (const item of projected.items) {
        const row = entries.filter({has: view.locator('strong', {hasText: item.question})});
        await expect(row).toContainText(item.state);
        await expect(row).toContainText(item.citationsCurrent ? 'Current evidence' : 'Evidence changed');
      }
      await expect(view.getByText('No decisions match these filters.', {exact: true})).toHaveCount(scenario.keys.length ? 0 : 1);
    };
    const openLog = async () => {
      await view.goto(origin + '/app/decisions', {waitUntil: 'networkidle'});
      await view.reload({waitUntil: 'networkidle'});
      const projected = await request('reader', 'GET', '/api/decisions');
      await checkList(cases[0], projected);
    };
    await openLog();
    await accessible(view, 'decision log populated');
    const observations = [];
    // Functional matrices run at desktop width; the existing phone caller
    // retains a populated smoke and the combined changed-citation controls.
    const filters = width === 1440 ? cases.slice(1) : cases.filter(item => item.name === 'combined changed');
    for (const scenario of filters) {
      for (const name of ['state', 'ownerId', 'containerId', 'citationsCurrent']) await view.locator(`select[name=${name}]`).selectOption(scenario.filter[name] ?? '');
      for (const name of ['decidedFrom', 'decidedTo', 'reviewFrom', 'reviewTo']) await view.locator(`input[name=${name}]`).fill(scenario.filter[name] ?? '');
      const response = view.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === '/api/decisions' && response.request().method() === 'GET'
          && JSON.stringify([...url.searchParams].sort()) === JSON.stringify(Object.entries(scenario.filter).sort());
      });
      await view.getByRole('button', {name: 'Filter decisions', exact: true}).click();
      const received = await response;
      assert.equal(received.status(), 200);
      const projected = await received.json();
      await checkList(scenario, projected);
      const direct = await request('reader', 'GET', '/api/decisions?' + new URLSearchParams(scenario.filter));
      assertDecisionMembership(direct.items, rows, scenario.keys, scenario.name + ' independent native read');
      observations.push({name: scenario.name, filter: scenario.filter, expected: scenario.keys.map(key => rows[key].id), actual: projected.items.map(item => item.id)});
      if (scenario.name === 'combined changed') await accessible(view, 'decision log combined changed evidence');
    }
    // Every accepted and superseded result, plus both current proposals, is
    // actually opened from the reloaded log and then reloaded at its destination.
    for (const key of cases[0].keys) {
      await openLog();
      const record = rows[key], href = record.acceptedRevisionHref ?? '/app/decisions/' + record.id;
      await entries.filter({hasText: 'Decision ' + key}).click();
      await view.waitForURL(origin + href);
      await view.reload({waitUntil: 'networkidle'});
      const article = view.locator('#decision-' + record.id);
      await expect(article.getByRole('heading', {name: 'Decision ' + key, exact: true})).toBeVisible();
      await expect(article.getByText(key === 'draft' ? 'Second draft' : 'First ' + key, {exact: true})).toBeVisible();
      await expect(article.getByText('Retained reasoning ' + key, {exact: true})).toBeVisible();
      const selected = await request('reader', 'GET', '/api/decisions/' + record.id + (record.acceptedRevisionId ? '?revision=' + record.acceptedRevisionId : ''));
      assert.equal(selected.viewedRevisionId, record.acceptedRevisionId ?? record.revision_id);
      assert.equal(new URL(view.url()).searchParams.get('revision'), record.acceptedRevisionId);
      if (record.acceptedRevisionId) {
        await expect(view.getByRole('status').filter({hasText: 'Exact retained decision revision: ' + record.acceptedRevisionId})).toBeVisible();
        await expect(article.getByRole('button', {name: 'Save proposed decision', exact: true})).toHaveCount(0);
      } else await expect(article.getByText('Choose the outcome', {exact: true})).toBeVisible();
      if (key === 'changed') {
        await expect(article.getByRole('alert')).toContainText('Supporting evidence has changed');
        await accessible(view, 'decision exact accepted revision after citation edit');
      }
      observations.push({key, href, viewedRevisionId: selected.viewedRevisionId, acceptedRevisionId: record.acceptedRevisionId});
    }
    assertDecisionMembership((await request('owner', 'GET', '/api/decisions')).items, rows, [...cases[0].keys, 'private'], 'Owner retains restricted decision');
    for (const route of ['/api/decisions/' + rows.private.id, '/api/decisions/' + rows.private.id + '?revision=' + rows.private.acceptedRevisionId]) {
      const refused = await call(bob.context, origin, 'GET', route);
      assert.equal(refused.status, 404);
      assert.equal(refused.body.code, 'NOT_FOUND');
      assert.ok(!JSON.stringify(refused.body).includes(rows.private.question));
    }
    // Reusing an exact accepted URL after host access changes must not expose it.
    const revoked = rows.reviewed;
    await request('owner', 'POST', '/api/sharing', {operationKey: crypto.randomUUID(), targetKind: 'page', targetId: revoked.page_id, principalKind: 'member', principalId: owner, level: 'full'});
    await request('owner', 'PUT', `/api/sharing/pages/${revoked.page_id}/inheritance`, {operationKey: crypto.randomUUID(), expectedRevisionId: (await api('/api/pages/' + revoked.page_id)).page.revisionId, restricted: true});
    await view.goto(origin + '/app/decisions', {waitUntil: 'networkidle'});
    await view.reload({waitUntil: 'networkidle'});
    const after = {name: 'revoked current access', keys: ['old', 'replacement', 'changed', 'draft', 'later']};
    await checkList(after, await request('reader', 'GET', '/api/decisions'));
    await view.goto(origin + revoked.acceptedRevisionHref, {waitUntil: 'networkidle'});
    await expect(view.locator('#decision-' + revoked.id)).toHaveCount(0);
    await expect(view.getByText(revoked.question, {exact: true})).toHaveCount(0);
    const replay = await call(bob.context, origin, 'GET', '/api/decisions/' + revoked.id + '?revision=' + revoked.acceptedRevisionId);
    assert.equal(replay.status, 404);
    const evidence = path.join('.artifacts/ui-convergence/decisions', String(width));
    await mkdir(evidence, {recursive: true});
    await writeFile(path.join(evidence, 'decision-log.json'), JSON.stringify({width, profile: 'core-wiki', receipts: corpus.receipts, observations, excluded: {private: rows.private.id, removed: rows.removed.id, revoked: revoked.id}}, null, 2));
  });
  await state.switchIdentity('owner');
  await page.goto('about:blank');
}
