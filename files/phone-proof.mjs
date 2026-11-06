import {withWorkspace,setupWorkspace} from '/workspace/run-slate-f181/tests/qualification/ui-convergence/browser-support.mjs';
import {syncedJourney} from '/workspace/run-slate-f181/tests/qualification/ui-convergence/synced-journey.mjs';
await withWorkspace({width:390,height:844},'core-wiki',async state=>{await setupWorkspace(state);await syncedJourney(state,390);});
