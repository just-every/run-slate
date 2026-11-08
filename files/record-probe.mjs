import {withWorkspace,setupWorkspace} from './run-slate/tests/qualification/ui-convergence/browser-support.mjs';
import {recordDetailJourney} from './run-slate/tests/qualification/ui-convergence/record-detail-journey.mjs';
for(const width of [1440,390]) {
 const start=performance.now();
 await withWorkspace({width,height:width===1440?1000:844},'core-wiki',async state=>{
  await setupWorkspace(state);
  await recordDetailJourney(state,width);
 });
 console.log(`PROBE replay: recordDetailJourney at ${width}px -> PASS (${Math.round(performance.now()-start)} ms)`);
}
