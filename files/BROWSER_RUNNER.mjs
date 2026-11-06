import {withWorkspace,setupWorkspace} from '/workspace/run-slate-f172/tests/qualification/ui-convergence/browser-support.mjs';
import {importReviewJourney} from '/workspace/run-slate-f172/tests/qualification/ui-convergence/import-review-journey.mjs';
for(const width of [1440,390])await withWorkspace({width,height:width===1440?1000:844},'core-wiki',async state=>{console.log('BROWSER_START '+width);await setupWorkspace(state);console.log('BROWSER_SETUP '+width);await importReviewJourney(state,width);});
