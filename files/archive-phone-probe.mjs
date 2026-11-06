import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {withWorkspace,setupWorkspace} from '/workspace/run-slate/tests/qualification/ui-convergence/browser-support.mjs';
import {beginTouchJourney} from '/workspace/run-slate/tests/qualification/ui-convergence/touch-journey.mjs';
import {archiveRetentionJourney} from '/workspace/run-slate/tests/qualification/ui-convergence/archive-retention-journey.mjs';
import {ok} from '/workspace/run-slate/tests/qualification/ui-convergence/two-people-support.mjs';
await withWorkspace({width:390,height:844},'core-wiki',async state=>{
 await setupWorkspace(state);
 const touch=await beginTouchJourney(state,390,{writePage:false});
 try {
  const p=(await ok(touch.context,state.origin,'POST','/api/pages',{operationKey:randomUUID(),containerId:touch.containerId,title:'Earlier retained memo'})).value;
  await ok(touch.context,state.origin,'POST',`/api/archive/${p.pageId}`,{operationKey:randomUUID(),expectedRevisionId:p.revisionId,action:'trash'});
  await archiveRetentionJourney(state,touch);
  assert.ok((await touch.api('/api/archive')).items.some(row=>row.id===p.pageId));
  console.log('ARCHIVE_PHONE_PROBE passed with pre-existing native trash preserved');
 } finally {await touch.close();}
},{},{scheduled:true});
