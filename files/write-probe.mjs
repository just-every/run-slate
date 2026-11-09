import test from 'node:test';
import { withWorkspace, setupWorkspace } from '/home/agent/rer-consolidation/work/sd-slate-c-f212-fix2/run-slate/tests/qualification/ui-convergence/browser-support.mjs';
import { writeJourney } from '/home/agent/rer-consolidation/work/sd-slate-c-f212-fix2/run-slate/tests/qualification/ui-convergence/write-journey.mjs';

test('main comparison: native writing and typed shortcuts at 390px', {timeout:240000}, async () => {
  await withWorkspace({width:390,height:844}, 'core-wiki', async state => {
    await setupWorkspace(state);
    try { await writeJourney(state, 390); }
    catch (cause) {
      for (let nested = cause; nested; nested = nested.cause) console.error('WRITE PROBE CAUSE', nested.stack ?? String(nested));
      throw cause;
    }
  });
});
