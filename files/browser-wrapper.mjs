import {withWorkspace,setupWorkspace} from '/workspace/run-slate/tests/qualification/ui-convergence/browser-support.mjs';
import {beginTouchJourney} from '/workspace/run-slate/tests/qualification/ui-convergence/touch-journey.mjs';
import {columnsJourney} from '/workspace/run-slate/tests/qualification/ui-convergence/columns-journey.mjs';
for(const width of [1440,390]){
  await withWorkspace({width,height:width===1440?1000:844},'core-wiki',async state=>{
    await setupWorkspace(state);
    const touch=await beginTouchJourney(state,width);
    try{await columnsJourney(state,width,touch);state.assertNoConsoleErrors();}
    finally{await touch.close();}
  });
}
