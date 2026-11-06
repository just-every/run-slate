import {withWorkspace,setupWorkspace} from '/home/agent/rer-consolidation/work/sd-slate-c-f176/run-slate/tests/qualification/ui-convergence/browser-support.mjs';
import {revisionSnapshotsJourney} from '/home/agent/rer-consolidation/work/sd-slate-c-f176/run-slate/tests/qualification/ui-convergence/revision-snapshots-journey.mjs';
const width=Number(process.env.REVISION_WIDTH??1440);
await withWorkspace({width,height:width===1440?1000:844},'core-wiki',async state=>{
  await setupWorkspace(state);
  await revisionSnapshotsJourney(state,width);
  state.assertNoConsoleErrors();
});
console.log(`REVISION_BROWSER_PASS width=${width}`);
