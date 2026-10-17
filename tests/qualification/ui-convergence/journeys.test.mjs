import assert from 'node:assert/strict';
import test from 'node:test';
import { expect } from '@playwright/test';
import { setupWorkspace, withWorkspace } from './browser-support.mjs';
import { commentJourney, searchJourney, settingsJourney, shareJourney, writeJourney } from './core-journeys.mjs';
import { askDraftJourney } from './ask-journey.mjs';
import { withSecondPerson } from './two-people-support.mjs';
import { concurrentEditingJourney } from './two-people-editing.mjs';
import { accessChangeJourney } from './two-people-access.mjs';
import { historyJourney } from './two-people-history.mjs';
import { databaseJourney } from './database-journey.mjs';
import { reviewRequestJourney } from './review-request-journey.mjs';

for (const width of [1440, 390]) {
  test(`real core-wiki journeys at ${width}px`, { timeout: 300000 }, async t => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      const refused = await state.context.request.get(state.origin + '/api/ai/availability');
      assert.equal(refused.status(), 403);
      assert.equal((await refused.json()).code, 'FEATURE_DISABLED');
      await expect(state.page.getByRole('button', { name: 'Ask', exact: true })).toHaveCount(0);
      await state.page.getByRole('button', { name: 'More', exact: true }).click();
      await expect(state.page.getByRole('menu').getByRole('menuitem', { name: 'Ask', exact: true })).toHaveCount(0);
      await state.page.keyboard.press('Escape');
      let pageId;
      await t.test('create, write, committed save, failed save and explicit retry', async () => { pageId = await writeJourney(state, width); });
      assert.ok(pageId, 'Writing must complete before dependent journeys.');
      await t.test('anchored comment, reset composer, reply and resolve', () => commentJourney(state, pageId));
      await t.test('invite existing member, persisted grant and canonical copied link', () => shareJourney(state, pageId));
      await t.test('query, highlighted results and opening exact page', () => searchJourney(state, pageId));
      await settingsJourney(state, width);
      await t.test('remove a field with impact confirmation and export current view CSV', () => databaseJourney(state));
    });
  });
  test(`two people edit at once, lose access mid-edit and restore history at ${width}px`, { timeout: 420000 }, async t => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await withSecondPerson(state, width, async people => {
        await t.test('different blocks, same block, title and unreachable server', () => concurrentEditingJourney(state, people));
        await t.test('removed, narrowed and expired access with unsaved typing', () => accessChangeJourney(state, people, width));
        await t.test('restore writes a new revision; citations resolve to theirs', () => historyJourney(state, people));
      });
    });
  });
  test(`named review request, reviewer queue, exact verify and overdue escalation at ${width}px`, { timeout: 240000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await withSecondPerson(state, width, people => reviewRequestJourney(state, people));
    }, {}, { scheduled: true });
  });
  test(`flagship no-provider Ask retains a page-scoped draft at ${width}px`, { timeout: 180000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'flagship', async state => {
      await setupWorkspace(state);
      await askDraftJourney(state);
    });
  });
}
