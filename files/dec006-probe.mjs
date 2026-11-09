import test from 'node:test';
import { withWorkspace, setupWorkspace } from '/home/agent/rer-consolidation/work/sd-slate-c-f212-fix2/candidate/tests/qualification/ui-convergence/browser-support.mjs';
import { decisionEditJourney } from '/home/agent/rer-consolidation/work/sd-slate-c-f212-fix2/candidate/tests/qualification/ui-convergence/decision-edit-journey.mjs';

for (const width of [390,1440]) {
  test('DEC-006 native proposal budget at '+width+'px', {timeout:600000}, async () => {
    await withWorkspace({width,height:width===390?844:1000},'core-wiki',async state => {
      await setupWorkspace(state);
      await decisionEditJourney(state,width);
    });
  });
}
