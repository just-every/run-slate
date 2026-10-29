import {browserProof} from './browser.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {phases,proofRecords,native,setContainer,setPage,sensitiveText} from './fixtures.mjs';
export async function beforeStep(context) {
 const state=phases.get(context.phase),info=state?.cases[context.step.id];if(!info)return;
 if(info.cls==='sensitive') {
  if(info.tool==='workspace.read')await state.updateWorkspace(sensitiveText());
  if(['navigation.read','containers.list','containers.read'].includes(info.tool))await setContainer(context,info.containerId,sensitiveText());
  if(['pages.list','queries.run'].includes(info.tool))await setPage(context,info.pageId,{title:sensitiveText()});
 }
 if(info.cls==='external'&&info.tool!=='grants.set') {
  const page=await native(context,'/api/pages/'+info.pageId);
  if(!page.publishedRevisionId){const preview=await native(context,'/api/pages/'+info.pageId+'/publish-preview',{expectedRevisionId:page.page.revisionId});await native(context,'/api/pages/'+info.pageId+'/publish',{expectedRevisionId:page.page.revisionId,previewFingerprint:preview.previewFingerprint});}
  const current=await native(context,'/api/pages/'+info.pageId);
  await native(context,'/api/publishing/'+info.pageId,{expectedRevisionId:current.page.revisionId,host:new URL(context.origin).host,slug:'door-'+randomUUID()});
 }
}
export async function afterStep(context) {
 const state=phases.get(context.phase),info=state?.cases[context.step.id];if(!info)return;
 if(info.tool==='tasks.update') {
  const document=await native(context,'/api/pages/'+info.pageId),block=document.blocks.find(block=>block.id===info.blockId);
  const activity=await native(context,'/api/activity?limit=100');
  const entry=activity.items.find(entry=>entry.operationKey===context.result.receipt.operationKey);
  assert.ok(entry?.actor?.displayName?.includes(' for '));
  assert.equal(block.content.completedByAgent,entry.actor.displayName);
  if(info.cls==='standard'){proofRecords.taskPageId=info.pageId;proofRecords.taskActor=entry.actor.displayName;}
 }
 if(info.tool==='containers.create'&&info.cls==='sensitive')await setContainer(context,context.result.value.id,'Agent-created container');
 if(info.tool==='containers.configure'&&info.cls==='sensitive')await setContainer(context,info.containerId,'Agent-configured container');
 if(info.cls==='sensitive') {
  if(info.tool==='workspace.read')await state.updateWorkspace('');
  if(['navigation.read','containers.list','containers.read'].includes(info.tool))await setContainer(context,info.containerId,'Read fixture container');
  if(['pages.list','queries.run'].includes(info.tool))await setPage(context,info.pageId,{title:'Read fixture page'});
 }
}
export default async function({request,origin,cookie,tool}) {
 const response=await request(new URL('/api/workspace',origin).href,{headers:{cookie}});assert.equal(response.status,200);
 const native=await response.json(),agent=await tool('slate.workspace.read',{});
 assert.equal(agent.result.structuredContent.id,native.id);
 await browserProof({request,origin,cookie,...proofRecords});
 console.log('Wiki curator native/agent workspace read parity: passed');
}
