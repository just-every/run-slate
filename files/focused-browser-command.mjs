import {withWorkspace,setupWorkspace} from '/workspace/run-slate/tests/qualification/ui-convergence/browser-support.mjs';
import {withSecondPerson} from '/workspace/run-slate/tests/qualification/ui-convergence/two-people-support.mjs';
import {decisionImmutabilityJourney} from '/workspace/run-slate/tests/qualification/ui-convergence/decision-immutability-journey.mjs';
for (const width of [1440,390]) {
  console.log(`DECISION_PROOF start width=${width}`);
  await withWorkspace({width,height:width===1440?1000:844},'core-wiki',async state=>{
    await setupWorkspace(state);
    await withSecondPerson(state,width,people=>decisionImmutabilityJourney(state,people));
  },{}, {scheduled:true,slack:true});
  console.log(`DECISION_PROOF success width=${width}`);
}
