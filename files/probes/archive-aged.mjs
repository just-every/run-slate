import { withWorkspace, setupWorkspace } from '../tests/qualification/ui-convergence/browser-support.mjs';
import { beginTouchJourney } from '../tests/qualification/ui-convergence/touch-journey.mjs';
import { archiveRetentionJourney } from '../tests/qualification/ui-convergence/archive-retention-journey.mjs';
await withWorkspace({width:390,height:844},'core-wiki',async state=>{
  await setupWorkspace(state);
  const touch=await beginTouchJourney(state,390,{writePage:false});
  await state.fixtureSql(["UPDATE sessions SET proof_at=0 WHERE member_id='browser-reader'"]);
  try { await archiveRetentionJourney(state,touch); }
  finally { await touch.close(); }
}, {}, {scheduled:true});
