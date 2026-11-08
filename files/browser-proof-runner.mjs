import {withWorkspace,setupWorkspace} from '/workspace/run-slate/tests/qualification/ui-convergence/browser-support.mjs';
import {withSecondPerson} from '/workspace/run-slate/tests/qualification/ui-convergence/two-people-support.mjs';
import {decisionReviewJourney} from '/workspace/run-slate/tests/qualification/ui-convergence/decision-review-journey.mjs';
for(const width of [1440,390]) {
  await withWorkspace({width,height:width===1440?1000:844},'core-wiki',async state=>{
    await setupWorkspace(state);
    await withSecondPerson(state,width,people=>decisionReviewJourney(state,people,width));
  },{},{scheduled:true});
  console.log('DECISION_WIDTH_PASS',width);
}
