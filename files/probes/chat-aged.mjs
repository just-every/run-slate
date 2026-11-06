import {withWorkspace,setupWorkspace} from '../tests/qualification/ui-convergence/browser-support.mjs';
import {chatJourney} from '../tests/qualification/ui-convergence/chat-journey.mjs';
await withWorkspace({width:1440,height:1000},'core-wiki',async state=>{
  await setupWorkspace(state);
  await state.fixtureSql(["UPDATE sessions SET proof_at=0 WHERE member_id='browser-owner'"]);
  await chatJourney(state,1440);
}, {}, {scheduled:true,slack:true});
