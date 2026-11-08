import {withWorkspace,setupWorkspace} from '/workspace/run-slate/tests/qualification/ui-convergence/browser-support.mjs';
import {beginTouchJourney} from '/workspace/run-slate/tests/qualification/ui-convergence/touch-journey.mjs';
import {automationRuleJourney} from '/workspace/run-slate/tests/qualification/ui-convergence/automation-rule-journey.mjs';
for(const width of [1440,390]) {
 await withWorkspace({width,height:width===1440?1000:844},'core-wiki',async state=>{
  await setupWorkspace(state);
  const touch=await beginTouchJourney(state,width,{writePage:false});
  try{await automationRuleJourney(state,touch);}finally{await touch.close();}
 },{},{scheduled:true});
}
