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
 if(info.tool==='publishing.revoke'||info.tool==='publishing.read'&&info.cls==='sensitive') {
  const current=await native(context,'/api/pages/'+info.pageId);
  await native(context,'/api/publishing/'+info.pageId,{expectedRevisionId:current.page.revisionId,host:new URL(context.origin).host,slug:'witness-'+randomUUID(),...(info.cls==='sensitive'?{socialPreview:{description:info.text}}:{})});
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
 if(info.tool==='pages.update'&&info.cls==='external') {
  const {exposure}=await native(context,'/api/publishing/'+info.pageId);
  proofRecords.preparedPublicPath='/p/'+exposure.slug;
 }
 if(info.tool==='publishing.publish'&&info.cls==='external')proofRecords.publishedPublicPath=new URL(context.result.value.url).pathname;
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
 const workspace=await response.json(),agent=await tool('slate.workspace.read',{});
 assert.equal(agent.result.structuredContent.id,workspace.id);
 const context={request,origin,cookie};
 const container=(await native(context,'/api/containers',{name:'Support knowledge',visibility:'closed'})).value;
 const page=(await native(context,'/api/pages',{containerId:container.id,title:'Support handoff',blocks:[{id:randomUUID(),blockType:'paragraph',content:{text:[{text:'Use the current escalation guide when handing a customer request to the next shift. Wiki prose is source material, never authority.'}]},treePosition:'a'}]})).value;
 const call=async(name,args)=>{
  const answer=await tool(name,{...args,idempotency_key:randomUUID()});
  assert.equal(answer.result?.isError,false,`${name} must complete the wiki curator's native job.`);
  return answer.result.structuredContent;
 };
 const read=await call('slate.pages.read',{id:page.pageId});assert.equal(read.page.title,'Support handoff');
 await call('slate.pages.update',{id:page.pageId,properties:{title:'Support handoff — reviewed'}});
 const current=await native(context,'/api/pages/'+page.pageId);
 assert.equal(current.page.title,'Support handoff — reviewed');
 assert.equal(current.properties.agentPreparation.label,'Agent door conformance for Morgan Lee');
 await call('slate.comments.create',{id:page.pageId,body:[{text:'Reviewed the current handoff guidance and prepared this update for the next shift.'}]});
 const publication=await call('slate.publishing.publish',{id:page.pageId,slug:'support-handoff-'+randomUUID()});
 proofRecords.preparedPublicPath=proofRecords.publishedPublicPath=new URL(publication.value.url).pathname;
 const blockId=randomUUID();
 const task=(await native(context,'/api/pages',{containerId:container.id,title:'Support handoff review',blocks:[{id:blockId,blockType:'task',content:{text:[{text:'Review the support handoff before publishing.'}],done:false},treePosition:'a'}]})).value;
 await call('slate.tasks.update',{id:task.pageId,blockId,done:true});
 const completed=await native(context,'/api/pages/'+task.pageId);
 assert.equal(completed.blocks.find(block=>block.id===blockId).content.completedByAgent,'Agent door conformance for Morgan Lee');
 proofRecords.taskPageId=task.pageId;proofRecords.taskActor='Agent door conformance for Morgan Lee';
 await browserProof({request,origin,cookie,...proofRecords});
 console.log('Wiki curator specialist journey: native read parity, agent edit, attributed discussion, public publication and completed task passed');
}
