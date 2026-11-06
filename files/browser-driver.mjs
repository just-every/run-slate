import {withWorkspace,setupWorkspace} from '/workspace/run-slate/tests/qualification/ui-convergence/browser-support.mjs';
import {revisionSnapshotsJourney} from '/workspace/run-slate/tests/qualification/ui-convergence/revision-snapshots-journey.mjs';
for(const width of [1440,390])await withWorkspace({width,height:width===1440?1000:844},'core-wiki',async state=>{await setupWorkspace(state);await revisionSnapshotsJourney(state,width);});
