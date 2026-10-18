import { exportCommentsJourney } from './export-comments-journey.mjs';
import { presentationJourney } from './presentation-journey.mjs';
import { analyticsJourney } from './analytics-journey.mjs';
import { reactionsJourney } from './reactions-journey.mjs';
import { pageDisplayJourney } from './page-display-journey.mjs';
import { createInPlaceJourney } from './create-in-place-journey.mjs';
import assert from 'node:assert/strict';
import { journeyTest as test } from './journey-shard.mjs';
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
import { hubJourney } from './hub-journey.mjs';
import { blogJourney } from './blog-journey.mjs';
import { treeFilterJourney } from './tree-filter-journey.mjs';
import { failedSaveJourney } from './failed-save-journey.mjs';
import { sharedNavigationJourney } from './shared-navigation-journey.mjs';
import { globalCreateJourney } from './global-create-journey.mjs';
import { pageLockBrowserJourney } from './page-lock-journey.mjs';
import { outlineJourney } from './outline-journey.mjs';
import { groupMentionJourney } from './group-mentions-journey.mjs';

for (const width of [1440, 390]) {
  test(`readable exports retain discussions through HTML and Markdown re-import at ${width}px`, { timeout: 180000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await withSecondPerson(state, width, people => exportCommentsJourney(state, people));
    });
  });
  test(`presentation paginates read-only slides and restores the page at ${width}px`, { timeout: 180000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await presentationJourney(state);
    });
  });
  test(`page and space readership show people, author views and inclusive dates at ${width}px`, { timeout: 180000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await withSecondPerson(state, width, people => analyticsJourney(state, people));
    });
  });
  test(`page and comment reactions identify people without notifications or views at ${width}px`, { timeout: 180000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await withSecondPerson(state, width, people => reactionsJourney(state, people));
    });
  });
  test(`page display settings are shared and survive export and import at ${width}px`, { timeout: 180000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await withSecondPerson(state, width, people => pageDisplayJourney(state, people));
    });
  });
  test(`create in place names root and child destinations at ${width}px`, { timeout: 180000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await createInPlaceJourney(state);
    });
  });
  test(`page locks protect content while editors comment and unlock at ${width}px`, { timeout: 180000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await withSecondPerson(state, width, people => pageLockBrowserJourney(state, people));
    });
  });
  test(`page outline follows headings and navigates long pages at ${width}px`, { timeout: 180000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await outlineJourney(state);
    });
  });
  test(`shared page invitations name their space and disappear on revocation at ${width}px`, { timeout: 240000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await withSecondPerson(state, width, people => sharedNavigationJourney(state, people));
    });
  });
  test(`global create names destinations for every content kind at ${width}px`, { timeout: 240000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await globalCreateJourney(state).catch(async cause => {
        await state.page.screenshot({ path: `.artifacts/ui-convergence/global-create-${width}-failure.png`, fullPage: true });
        console.error(cause);
        throw cause;
      });
    });
  });
  test(`space tree title filtering preserves ancestors, access and expansion at ${width}px`, { timeout: 180000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await treeFilterJourney(state);
    });
  });
  test(`rejected writes retain drafts and require explicit retry at ${width}px`, { timeout: 180000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await failedSaveJourney(state);
    });
  });
  test(`editable space home and curated company hub for a new member at ${width}px`, { timeout: 240000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await withSecondPerson(state, width, people => hubJourney(state, people));
    });
  });
  test(`group mentions preview readers and refuse oversized groups at ${width}px`, { timeout: 240000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await withSecondPerson(state, width, people => groupMentionJourney(state, people));
    });
  });
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
  test(`space blog post reaches a follower's inbox and Home at ${width}px`, { timeout: 240000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await withSecondPerson(state, width, people => blogJourney(state, people));
    });
  });
  test(`flagship no-provider Ask retains a page-scoped draft at ${width}px`, { timeout: 180000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'flagship', async state => {
      await setupWorkspace(state);
      await askDraftJourney(state);
    });
  });
}
