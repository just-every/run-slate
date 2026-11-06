import {withWorkspace,setupWorkspace} from './tests/qualification/ui-convergence/browser-support.mjs';
import {syncedRequestPhoneJourney} from './tests/qualification/ui-convergence/synced-journey.mjs';
await withWorkspace({width:390,height:844},'core-wiki',async state=>{
 await setupWorkspace(state);
 await syncedRequestPhoneJourney(state);
 state.assertNoConsoleErrors();
});
console.log('Synced paragraph phone proof passed.');
