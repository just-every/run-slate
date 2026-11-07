import test from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const load = name => import(pathToFileURL(path.join(process.cwd(), 'tests/qualification/ui-convergence', name)).href);
const { withWorkspace, setupWorkspace } = await load('browser-support.mjs');
const { withSecondPerson } = await load('two-people-support.mjs');
const { sharedNavigationJourney } = await load('shared-navigation-journey.mjs');
const { syncedCustodyJourney, syncedHistoryJourney, syncedMemberErasureJourney } = await load('synced-custody.mjs');
const { permissionLevelsJourney } = await load('sharing-journey.mjs');
const width = 390;
test('shared page invitations name their space and disappear on revocation at 390px', { timeout: 240000 }, async t => {
  const phase = async (name, run) => {
    const started = performance.now();
    try { return await run(); }
    finally { t.diagnostic(`Sharing phase ${name}: ${Math.round(performance.now() - started)} ms`); }
  };
  await withWorkspace({ width, height: 844 }, 'core-wiki', async state => {
    await phase('setup', () => setupWorkspace(state));
    await phase('navigation', () => withSecondPerson(state, width, people => sharedNavigationJourney(state, people)));
    await phase('synced custody', () => syncedCustodyJourney(state,width));
    await phase('synced history', () => syncedHistoryJourney(state,width));
    await phase('synced erasure', () => syncedMemberErasureJourney(state,width));
  });
});
for (const level of ['full', 'edit', 'comment', 'view']) {
  test(`native ordinary page ${level} authority retains inventories and refuses revoked captures at 390px`, { timeout: 240000 }, async t => {
    await withWorkspace({ width, height: 844 }, 'core-wiki', async state => {
      const setup = performance.now();
      await setupWorkspace(state);
      t.diagnostic(`Sharing ${level} setup: ${Math.round(performance.now() - setup)} ms`);
      const matrix = performance.now();
      try { await permissionLevelsJourney(state, { levels: [level] }); }
      finally { t.diagnostic(`Sharing ${level} matrix: ${Math.round(performance.now() - matrix)} ms`); }
    });
  });
}
