import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {withWorkspace,setupWorkspace} from '/workspace/run-slate/tests/qualification/ui-convergence/browser-support.mjs';
import {beginTouchJourney} from '/workspace/run-slate/tests/qualification/ui-convergence/touch-journey.mjs';
import {call,ok} from '/workspace/run-slate/tests/qualification/ui-convergence/two-people-support.mjs';
import {signInWithOutbox} from '/workspace/run-slate/tests/e2e/outbox-auth.mjs';
await withWorkspace({width:390,height:844},'core-wiki',async state=>{
 await setupWorkspace(state);
 const touch=await beginTouchJourney(state,390,{writePage:false});
 try {
  const current=await touch.api('/api/members/current');
  const p=(await ok(touch.context,state.origin,'POST','/api/pages',{operationKey:randomUUID(),containerId:touch.containerId,title:'synthetic-slate-63'})).value;
  await ok(touch.context,state.origin,'POST',`/api/archive/${p.pageId}`,{operationKey:randomUUID(),expectedRevisionId:p.revisionId,action:'trash'});
  await state.fixtureSql(["UPDATE sessions SET proof_at='2001-02-03T04:05:06.000Z' WHERE member_id='browser-reader'"]);
  const refused=await call(touch.context,state.origin,'POST',`/api/archive/${p.pageId}/permanent-delete`,{operationKey:randomUUID(),confirmedPageIds:[p.pageId]});
  assert.equal(refused.status,403);assert.equal(refused.body.code,'STEP_UP_REQUIRED');
  assert.ok((await touch.api('/api/archive')).items.some(row=>row.id===p.pageId));
  const session=await signInWithOutbox(state.origin,current.email);
  await touch.context.addCookies(session.cookie.split('; ').map(item=>{const [name,value]=item.split('=');return {name,value,url:state.origin};}));
  const allowed=await call(touch.context,state.origin,'POST',`/api/archive/${p.pageId}/permanent-delete`,{operationKey:randomUUID(),confirmedPageIds:[p.pageId]});
  assert.equal(allowed.status,200,JSON.stringify(allowed.body));
  console.log('STEP_UP_PROBE',JSON.stringify({stale:{status:refused.status,code:refused.body.code,message:refused.body.message,unchanged:true},freshNativeSignIn:{memberId:session.body.member.id,deleteStatus:allowed.status,deletedPageIds:allowed.body.value.deletedPageIds}}));
 } finally {await touch.close();}
},{},{scheduled:true});
