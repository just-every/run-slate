import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { closeDetails, openPageAction } from './browser-support.mjs';
import { accessible } from './browser-evidence.mjs';
import { call, ok, withSecondPerson } from './two-people-support.mjs';

/** STAT-002: native member edits, durable single status, replay and live discovery. */
export async function pageStatusJourney(state) {
  const { context, origin, api } = state;
  const width = state.page.viewportSize().width;
  const mutate = (path, data) => ok(context, origin, 'POST', path, { operationKey: randomUUID(), ...data });
  const workspace = await api('/api/workspace');
  const policy = async policies => {
    const { id, revisionId, ...fields } = await api('/api/workspace');
    await ok(context, origin, 'PUT', '/api/workspace', { ...fields, operationKey: randomUUID(), expectedRevisionId: revisionId, policies });
  };
  await policy({ ...workspace.policies, 'page.status.v1': 'open-vocabulary' });
  try {
    for (const [key, label, requiresVerification] of [['rough-draft', 'Rough draft', false], ['in-progress', 'In progress', false], ['verified', 'Verified', true]]) {
      await mutate('/api/status', { key, label, color: '#228855', requiresVerification });
    }
    const space = (await mutate('/api/containers', { name: 'Status handover', visibility: 'private' })).value.id;
    const authority = { targetKind: 'container', targetId: space, principalKind: 'member', principalId: 'browser-reader', level: 'edit' };
    const grant = await mutate('/api/sharing', authority);
    const create = async (title, text) => (await mutate('/api/pages', { containerId: space, title, blocks: [{ id: randomUUID(), blockType: 'paragraph', treePosition: 'a', content: { text: [{ text }] } }] })).value.pageId;
    const target = await create('Statusneedle handover', 'Keep the named responder and the written handover intact while its status changes.');
    const original = await api(`/api/pages/${target}`);
    const definitions = ['rough-draft', 'in-progress'].map(status => ({ container: space, status, orderBy: 'title', limit: 20 }));
    const controls = [];
    for (const [index, status] of ['rough-draft', 'in-progress'].entries()) {
      const title = `Statusneedle ${index ? 'ongoing' : 'draft'} reference`;
      const id = await create(title, index ? 'The active service guide records the current escalation contact.' : 'A preliminary checklist awaits the next editorial pass.');
      await mutate(`/api/status/page/${id}`, { expectedRevisionId: (await api(`/api/pages/${id}`)).page.revisionId, statusKey: status });
      controls.push({ id, title });
    }
    const queries = (await mutate('/api/pages', { containerId: space, title: 'Status handover index', blocks: definitions.map((definition, index) => ({ id: randomUUID(), blockType: 'content-query', treePosition: String(index), content: { definition } })) })).value.pageId;
    await withSecondPerson(state, width, async ({ bob }) => {
      const { page, context: editor } = bob;
      const read = route => ok(editor, origin, 'GET', route);
      const statusPath = `/api/status/page/${target}`;
      const activity = async () => (await read('/api/activity?action=pages.status&limit=100')).items.filter(item => item.target.id === target);
      assert.equal((await read('/api/session')).member.role, 'member');
      assert.equal((await read(`/api/pages/${target}`)).permissions.level, 'edit');
      const committed = [];
      async function change(statusKey, label) {
        await page.goto(`${origin}/app/pages/${target}`, { waitUntil: 'networkidle' });
        await openPageAction(page, 'Page status');
        await page.getByRole('combobox', { name: 'Set page status', exact: true }).selectOption(statusKey ?? '__clear');
        const dialog = page.getByRole('dialog', { name: 'Change page status', exact: true });
        const pending = page.waitForResponse(response => new URL(response.url()).pathname === statusPath && response.request().method() === 'POST');
        await dialog.getByRole('button', { name: 'Set status', exact: true }).click();
        const response = await pending;
        assert.equal(response.status(), 200, await response.text());
        const submitted = response.request().postDataJSON(), receipt = await response.json();
        assert.equal(submitted.statusKey, statusKey);
        assert.equal(receipt.receipt.operationKey, submitted.operationKey);
        assert.deepEqual(receipt.receipt.entity, { id: target, kind: 'page', revisionId: receipt.value.revisionId });
        await expect(dialog).toHaveCount(0);
        assert.deepEqual(await ok(editor, origin, 'POST', statusPath, submitted), receipt, 'Replaying the genuine UI write returns the original receipt.');
        committed.push(receipt.receipt);
        await closeDetails(page);
        for (const reload of [false, true]) {
          if (reload) await page.reload({ waitUntil: 'networkidle' });
          const chips = page.locator('.page-status-chip');
          await expect(chips).toHaveCount(statusKey ? 1 : 0);
          if (statusKey) await expect(chips).toHaveText(label);
          const document = await read(`/api/pages/${target}`);
          assert.equal(document.properties.statusKey, statusKey);
          assert.equal(document.page.revisionId, receipt.value.revisionId);
          assert.deepEqual(document.blocks, original.blocks, 'Status writes preserve body content and block revisions.');
          const entries = await activity();
          assert.equal(entries.length, committed.length, 'Each native change contributes exactly one activity entry, including after replay and reload.');
          for (const saved of committed) {
            const matches = entries.filter(item => item.operationKey === saved.operationKey);
            assert.equal(matches.length, 1);
            assert.equal(matches[0].id, saved.activityId);
            assert.equal(matches[0].actor.id, 'browser-reader');
            assert.equal(matches[0].occurredAt, saved.committedAt);
          }
        }
        return receipt;
      }
      async function discovery(statusKey, capture = false) {
        const expected = definitions.map((definition, index) => [controls[index], ...(definition.status === statusKey ? [{ id: target, title: 'Statusneedle handover' }] : [])]);
        await page.goto(origin + '/app/search', { waitUntil: 'networkidle' });
        await page.getByRole('searchbox', { name: 'Search your workspace', exact: true }).fill('Statusneedle');
        await page.getByRole('button', { name: 'Search', exact: true }).click();
        await page.locator('.search-options > summary').click();
        await page.getByRole('combobox', { name: 'Look in', exact: true }).selectOption('page');
        await page.getByText('Refine your search', { exact: true }).click();
        for (const [index, definition] of definitions.entries()) {
          await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption(definition.status);
          await expect.poll(async () => (await page.locator('.search-results h2').allTextContents()).sort()).toEqual(expected[index].map(item => item.title).sort());
          const result = await read('/api/search?' + new URLSearchParams({ q: 'Statusneedle', kind: 'page', status: definition.status }));
          assert.deepEqual(result.items.map(item => item.id).sort(), expected[index].map(item => item.id).sort());
        }
        if (capture) await accessible(page, 'page status search');
        await page.goto(`${origin}/app/pages/${queries}`, { waitUntil: 'networkidle' });
        const retained = (await read(`/api/pages/${queries}`)).blocks.filter(block => block.blockType === 'content-query');
        assert.deepEqual(retained.map(block => block.content.definition), definitions, 'Query filters are retained in real page content.');
        for (const [index, block] of retained.entries()) {
          const result = await ok(editor, origin, 'POST', `/api/pages/${queries}/query`, block.content.definition);
          assert.deepEqual(result.items.map(item => item.id).sort(), expected[index].map(item => item.id).sort());
          const region = page.getByRole('region', { name: 'Content query', exact: true }).nth(index);
          await expect.poll(async () => (await region.locator('tbody tr button').allTextContents()).sort()).toEqual(expected[index].map(item => item.title).sort());
        }
        if (capture) await accessible(page, 'page status persisted queries');
      }
      await change('rough-draft', 'Rough draft');
      await accessible(page, 'page status member chip');
      await openPageAction(page, 'Page status');
      await accessible(page, 'page status member controls');
      await closeDetails(page);
      // Functional assertions run at desktop; the existing phone case supplies screen proof.
      if (width === 390) {
        await page.goto(origin + '/app/search?q=Statusneedle&kind=page&status=rough-draft', { waitUntil: 'networkidle' });
        await expect(page.locator('.search-results h2').first()).toBeVisible();
        await accessible(page, 'page status search');
        await page.goto(`${origin}/app/pages/${queries}`, { waitUntil: 'networkidle' });
        await expect(page.getByRole('region', { name: 'Content query', exact: true }).first().locator('tbody tr').first()).toBeVisible();
        await accessible(page, 'page status persisted queries');
        return;
      }
      await discovery('rough-draft', true);
      await change('in-progress', 'In progress');
      await discovery('in-progress');
      await change(null);
      await discovery(null);
      const before = await read(`/api/pages/${target}`), entries = await activity();
      // Human verification still requires an exact attestation, even for an editor.
      const verification = await call(editor, origin, 'POST', statusPath, { operationKey: randomUUID(), expectedRevisionId: before.page.revisionId, statusKey: 'verified' });
      assert.equal(verification.status, 409);
      assert.equal(verification.body.code, 'EXACT_REVISION_REQUIRED');
      await mutate('/api/sharing', { ...authority, id: grant.value.id, level: 'view' });
      await page.goto(`${origin}/app/pages/${target}`, { waitUntil: 'networkidle' });
      await openPageAction(page, 'Page status');
      await expect(page.getByRole('combobox', { name: 'Set page status', exact: true })).toHaveCount(0);
      for (const statusKey of ['rough-draft', 'in-progress', null]) {
        const refused = await call(editor, origin, 'POST', statusPath, { operationKey: randomUUID(), expectedRevisionId: before.page.revisionId, statusKey });
        assert.equal(refused.status, 404);
      }
      const after = await read(`/api/pages/${target}`);
      assert.equal(after.page.revisionId, before.page.revisionId);
      assert.equal(after.properties.statusKey, null);
      assert.deepEqual(after.blocks, before.blocks);
      assert.deepEqual(await activity(), entries, 'Verification and viewer refusals leave status activity unchanged.');
      await closeDetails(page);
      await discovery(null);
    });
  } finally {
    await policy(workspace.policies);
  }
}
