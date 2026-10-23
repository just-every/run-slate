import {peopleJourney} from './people-journey.mjs';
import {syncedJourney} from './synced-journey.mjs';
import {touchDatabaseToolsJourney} from './touch-database-tools-journey.mjs';
import {touchManagementJourney} from './touch-management-journey.mjs';
import {touchPageToolsJourney} from './touch-page-tools-journey.mjs';
import {touchOperatorJourney} from './touch-operator-journey.mjs';
import {columnsJourney} from './columns-journey.mjs';
import {beginTouchJourney} from './touch-journey.mjs';
import {touchCommentJourney,touchPublishShareJourney} from './touch-page.mjs';
import {touchDatabaseJourney} from './touch-database.mjs';
import { samlJourney } from './saml-journey.mjs';
import { folderJourney } from './folder-journey.mjs';
import {tablesJourney} from './tables-journey.mjs';
import {providerEmbedsJourney} from './provider-embeds-journey.mjs';
import { exportCommentsJourney } from './export-comments-journey.mjs';
import { backupsJourney } from './backups-journey.mjs';
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
import { followingJourney } from './following-journey.mjs';
import { treeFilterJourney } from './tree-filter-journey.mjs';
import { failedSaveJourney } from './failed-save-journey.mjs';
import { sharedNavigationJourney } from './shared-navigation-journey.mjs';
import { globalCreateJourney } from './global-create-journey.mjs';
import { starterTemplatesJourney } from './starter-templates-journey.mjs';
import { taskAssignmentJourney } from './task-assignment-journey.mjs';
import { recordTemplatesJourney } from './record-templates-journey.mjs';
import { pageLockBrowserJourney } from './page-lock-journey.mjs';
import { outlineJourney } from './outline-journey.mjs';
import { groupMentionJourney } from './group-mentions-journey.mjs';
import { taskReportJourney } from './task-report-journey.mjs';
import { myTasksJourney } from './my-tasks-journey.mjs';
import { trustRankingJourney } from './trust-ranking-journey.mjs';
import { chatJourney } from './chat-journey.mjs';

for (const width of [1440, 390]) {
  test(`spreadsheet tables merge, sort and round-trip through edited database records at ${width}px`, {timeout:240000}, async()=>{
    await withWorkspace({width,height:width===1440?1000:844},'core-wiki',async state=>{await setupWorkspace(state);await tablesJourney(state);});
  });
  test(`provider embeds load only on interaction and [EMBED-004] files respect reader access at ${width}px`, {timeout:240000}, async()=>{
    await withWorkspace({width,height:width===1440?1000:844},'core-wiki',async state=>{await setupWorkspace(state);await providerEmbedsJourney(state);}, {}, {folders:true});
  });
  test(`presentation paginates read-only slides; touch history, details and exports work at ${width}px`, { timeout: 180000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await presentationJourney(state);
      const touch=await beginTouchJourney(state,width);try{await touchPageToolsJourney(touch);}finally{await touch.close();}
    });
  });
  test(`readable exports retain discussions through HTML and Markdown re-import at ${width}px`, { timeout: 180000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await withSecondPerson(state, width, people => exportCommentsJourney(state, people));
      await backupsJourney(state);
      await folderJourney(state);
    }, {}, { backups: true, folders: true });
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
  test(`TMPL-007 starter templates are found by category; touch spaces, templates, archive and workspace settings work at ${width}px`, { timeout: 240000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await starterTemplatesJourney(state).catch(async cause => {
        await state.page.screenshot({ path: `.artifacts/ui-convergence/starter-templates-${width}-failure.png`, fullPage: true });
        throw cause;
      });
      const touch=await beginTouchJourney(state,width);try{await touchManagementJourney(state,touch);}finally{await touch.close();}
    });
  });
  test(`DB-015 — a database's Templates tab says a schedule runs as its last saver, and a re-save hands it over at ${width}px`, { timeout: 240000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await withSecondPerson(state, width, people => recordTemplatesJourney(state, people));
    });
  });
  test(`BLOCK-016 — a task report shows each reader only the tasks they can read, completes one on its page and stays a sign-in notice when published at ${width}px`, { timeout: 240000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await withSecondPerson(state, width, people => taskReportJourney(state, people));
    });
  });
  test(`NAV-007 — My tasks lists assigned open tasks by due date, completes on the page and drops a revoked page at ${width}px`, { timeout: 240000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await withSecondPerson(state, width, people => myTasksJourney(state, people));
    });
  });
  test(`SEARCH-011 — verified, unverified and lapsed pages rank in order with badges, near-duplicates collapse and published views carry no trust at ${width}px`, { timeout: 240000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await trustRankingJourney(state);
    });
  });
  test(`BLOCK-015 — a typed task is assigned with @, dated with //, notifies once and shows overdue at ${width}px`, { timeout: 240000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await withSecondPerson(state, width, people => taskAssignmentJourney(state, people));
    });
  });
  test(`CONT-012 a watched space's create, edit sessions and comment appear once each in Home's Following at ${width}px`, { timeout: 240000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await withSecondPerson(state, width, people => followingJourney(state, people));
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
  test(`real core-wiki and touch-member journeys at ${width}px`, { timeout: 300000 }, async t => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      const refused = await state.context.request.get(state.origin + '/api/ai/availability');
      assert.equal(refused.status(), 403);
      assert.equal((await refused.json()).code, 'FEATURE_DISABLED');
      await expect(state.page.getByRole('button', { name: 'Ask', exact: true })).toHaveCount(0);
      await state.page.getByRole('button', { name: 'More', exact: true }).click();
      await expect(state.page.getByRole('menu').getByRole('menuitem', { name: 'Ask', exact: true })).toHaveCount(0);
      await state.page.keyboard.press('Escape');
      let pageId,touch;
      try {
        await t.test('BLOCK-001 — a new page body takes real keystrokes, including before it finishes loading, and keeps them through committed save, failed save, explicit retry and leaving; touch member creates, inserts and drags blocks', async () => { pageId = await writeJourney(state, width); touch=await beginTouchJourney(state,width);await columnsJourney(state,width,touch); });
        assert.ok(pageId, 'Writing must complete before dependent journeys.');
        assert.ok(touch, 'Touch-member writing must complete before its dependent journeys.');
        await t.test('anchored comment, reset composer, reply and resolve; touch member comments and resolves', async () => {await commentJourney(state, pageId);await touchCommentJourney(touch,touch.pageId);});
        await t.test('invite existing member, persisted grant and canonical copied link; touch member publishes and shares', async () => {await shareJourney(state, pageId);await touchPublishShareJourney(touch,touch.pageId);});
        await t.test('query, highlighted results and opening exact page; touch Search, Inbox, My tasks and review queues', async () => {await searchJourney(state, pageId);await touchOperatorJourney(state,touch);});
        await settingsJourney(state, width);
        // Finish earlier page notifications before connecting the chat journey destinations.
        await state.runScheduled();
        await chatJourney(state, width);
        await t.test('remove a field with impact confirmation and export current view CSV; touch member edits all six layouts and uses charts, templates and automations', async () => {await databaseJourney(state);await touchDatabaseJourney(touch,touch.containerId);await touchDatabaseToolsJourney(state,touch);});
      } finally {await touch?.close();}
    }, {}, { scheduled: true, slack: true });
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
      await syncedJourney(state,width);
      await peopleJourney(state,width);
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
  test(`SAML sign-in verifies the domain and signatures while preserving guest and designated-owner access at ${width}px`, { timeout: 180000 }, async () => {
    await withWorkspace({ width, height: width === 1440 ? 1000 : 844 }, 'core-wiki', async state => {
      await setupWorkspace(state);
      await samlJourney(state);
    }, {}, { scheduled: true, saml: true });
  });

}
