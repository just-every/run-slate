import assert from 'node:assert/strict';
import test from 'node:test';
import { setupWorkspace, withWorkspace } from '../qualification/ui-convergence/browser-support.mjs';
import { spacesJourney, settingsJourney, navigationAndSearch } from './polish/workspace.mjs';
import { sharedHeaderJourney } from './polish/header.mjs';
import { editorJourney } from './polish/editor.mjs';
import { editorFocusJourney } from './polish/editor-focus.mjs';
import { insertionRecoveryJourney } from './polish/insertion-recovery.mjs';
import { mentionTypingJourney } from './polish/mentions.mjs';
import { assertCaptureInventory } from './polish/inventory.mjs';
import { pagePanelsJourney, commentsFailureJourney } from './polish/panels.mjs';

// The qualification harness seeds identity only. Setup, content, comments and all
// reads/writes use the emitted Worker, real API, real browser and persisted D1.
// Offline mode blocks transport; focus barriers forward genuine Worker responses.
for (const width of [1440]) {
  test(`insertion recovery preserves later saved content at ${width}px`, { timeout: 180000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      const page = (await state.api('/api/pages')).items.find(page => page.title === 'Welcome');
      assert.ok(page);
      await insertionRecoveryJourney(state, page.containerId);
    });
  });
  test(`visible Slate polish and genuine failure/retry at ${width}px`, { timeout: 420000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'flagship', async state => {
      await setupWorkspace(state);
      const pageId = (await state.api('/api/pages')).items.find(page => page.title === 'Welcome')?.id;
      assert.ok(pageId, 'Real first run created the page used by these journeys');
      await spacesJourney(state);
      await settingsJourney(state, width);
      await navigationAndSearch(state, width);
      await sharedHeaderJourney(state, pageId);
      await editorJourney(state, pageId, width);
      await pagePanelsJourney(state, pageId);
      await commentsFailureJourney(state, pageId);
      assertCaptureInventory(width);
      assert.deepEqual(state.modelRequests, [], 'Flagship polish does not submit model work');
    });
  });
  test(`genuine insertion focus lifecycle at ${width}px`, { timeout: 240000 }, async () => {
    // Independent deployments preserve each scenario's real request budget.
    // Start them together so cold native startup fits the original deadline.
    const scenarios = [
      ...['insertion', 'navigation', 'formatting'].map(part => ({
        name: part,
        run: () => withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'flagship', async state => {
          await setupWorkspace(state);
          const page = (await state.api('/api/pages')).items.find(page => page.title === 'Welcome');
          assert.ok(page, 'Real first run supplies the lifecycle journey container');
          await editorFocusJourney(state, page.containerId, part);
          assert.deepEqual(state.modelRequests, [], 'Insertion focus does not submit model work');
        }),
      })),
      {
        name: 'mention typing',
        run: () => withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
          await setupWorkspace(state);
          const page = (await state.api('/api/pages')).items.find(page => page.title === 'Welcome');
          assert.ok(page, 'Real first run supplies the mention journey page');
          await state.page.goto(`${state.origin}/app/pages/${page.id}`, { waitUntil: 'networkidle' });
          await mentionTypingJourney(state, page.id);
          assert.deepEqual(state.modelRequests, [], 'Mention editing does not submit model work');
        }),
      },
    ];
    let nextScenario = 0;
    const failures = [];
    // Two independent deployments overlap startup without competing browsers in every scenario.
    await Promise.all([0, 1].map(async () => {
      for (;;) {
        const scenario = scenarios[nextScenario++];
        if (!scenario) return;
        try { await scenario.run(); }
        catch (cause) { failures.push(new Error(`Focus scenario ${scenario.name} failed`, { cause })); }
      }
    }));
    if (failures.length === 1) throw failures[0];
    if (failures.length) throw new AggregateError(failures, failures.map(error => `${error.message}: ${error.cause?.message}`).join('\n'));
  });
}

// Settings tabs, phone navigation and panel geometry have distinct phone-layout assertions.
// Recovery and focus keep their complete journey at 1440; qualification owns the seed's 390 smoke.
{
  const width = 390;
  test(`visible Slate polish and genuine failure/retry at ${width}px`, { timeout: 420000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'flagship', async state => {
      await setupWorkspace(state);
      const pageId = (await state.api('/api/pages')).items.find(page => page.title === 'Welcome')?.id;
      assert.ok(pageId, 'Real first run created the page used by these journeys');
      await spacesJourney(state);
      await settingsJourney(state, width);
      await navigationAndSearch(state, width);
      await sharedHeaderJourney(state, pageId);
      await editorJourney(state, pageId, width);
      await pagePanelsJourney(state, pageId);
      await commentsFailureJourney(state, pageId);
      assertCaptureInventory(width);
      assert.deepEqual(state.modelRequests, [], 'Flagship polish does not submit model work');
    });
  });
}
