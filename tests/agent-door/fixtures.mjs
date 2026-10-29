import {nativeClients} from './clients.mjs';
import assert from 'node:assert/strict';
import {randomUUID,randomInt} from 'node:crypto';
import fs from 'node:fs/promises';
export const phases=new Map();
export const proofRecords={};

export const sensitiveText=()=>`SSN: ${String(randomInt(100,900))}-${String(randomInt(10,99))}-${String(randomInt(1000,9999))}`;
const nativeStarts=[];
export async function native(context,path,body,method=body?'POST':'GET') {
 // Pace fixture preparation against the real person capacity, with room for
 // the client bootstrap and browser's own native requests. Never retry a refusal.
 while(nativeStarts.length&&nativeStarts[0]<=Date.now()-60_000)nativeStarts.shift();
 if(nativeStarts.length>=500)await new Promise(resolve=>setTimeout(resolve,Math.max(1,nativeStarts[0]+60_000-Date.now())));
 while(nativeStarts.length&&nativeStarts[0]<=Date.now()-60_000)nativeStarts.shift();
 nativeStarts.push(Date.now());
 const response=await context.request(new URL(path,context.origin).href,{method,headers:{cookie:context.cookie,origin:context.origin,'content-type':'application/json'},...(body?{body:JSON.stringify({...body,operationKey:randomUUID()})}:{}),redirect:'manual'});
 const data=await response.json().catch(()=>null);
 assert.ok(response.ok,`Native fixture ${path} returned ${response.status} (${data?.code??'non-JSON'}).`);
 return data;
}
export async function setContainer(context,id,name) {
 const current=await native(context,'/api/containers/'+id);
 await native(context,'/api/containers/'+id,{expectedRevisionId:current.revisionId,name},'PATCH');
}
export async function setPage(context,id,properties) {
 const current=await native(context,'/api/pages/'+id);
 await native(context,'/api/pages/'+id,{expectedRevisionId:current.page.revisionId,properties},'PATCH');
}
async function prepare(context) {
 const surface=JSON.parse(await fs.readFile(new URL('../../agent-surface.json',import.meta.url),'utf8'));
 const values={},cases={};
 const members=await native(context,'/api/members');
 const reviewer=members.items.find(person=>person.email==='synthetic-reviewer@example.invalid');
 const ownerId=members.items.find(person=>person.email===context.email).id;
 assert.ok(reviewer,'Native reviewer membership must exist.');
 // Remove sensitive labels from prior native fixtures; never erase their audit.
 for(const c of (await native(context,'/api/containers')).items)if(/SSN:/.test(c.name))await setContainer(context,c.id,'Reviewed fixture container');
 const workspace=await native(context,'/api/workspace');
 const updateWorkspace=async(description)=>native(context,'/api/workspace',{expectedRevisionId:(await native(context,'/api/workspace')).revisionId,name:workspace.name,mark:workspace.mark,description,guestAccess:workspace.guestAccess,publicLinkAccess:workspace.publicLinkAccess,anonymousAccess:workspace.anonymousAccess,policies:workspace.policies},'PUT');
 if(/SSN:/.test(workspace.description))await updateWorkspace('');
 const shared=(await native(context,'/api/containers',{name:'Case workspace '+randomUUID(),visibility:'closed'})).value;
 const open=(await native(context,'/api/containers',{name:'Shared destination '+randomUUID(),visibility:'open'})).value;
 const escalation=(await native(context,'/api/pages',{containerId:shared.id,title:'Escalation witness'})).value;
 values.escalation_page=escalation.pageId;
 const localPage=(await native(context,'/api/pages',{containerId:shared.id,title:'Scoped client record'})).value;
 const foreignPage=(await native(context,'/api/pages',{containerId:open.id,title:'Outside client scope'})).value;
 const clients=await nativeClients(context,shared.id,localPage.pageId,foreignPage.pageId);
 values.local_page={id:localPage.pageId};
 values.local_create={containerId:shared.id,title:'Native client-created record'};
 const guestId=(await native(context,'/api/guests')).items.find(person=>person.email==='synthetic-guest@example.invalid').id;
 const group=(await native(context,'/api/groups',{name:'Native escalation group '+randomUUID(),memberIds:[reviewer.id]})).value;
 values.escalation_group={id:group.id,name:group.name,memberId:reviewer.id};


 for(const step of surface.journey) {
  const cls=step.expect.at(-1).class,key=step.id,tool=step.tool.slice(6);
  if(step.client){cases[key]={cls,tool};continue;}
  let args={};
  if(tool==='events.list'){args={limit:200};values[key]=args;continue;}
  if(tool==='groups.list'){values[key]={};cases[key]={cls,tool};continue;}
  if(tool==='groups.manage') {
   if(cls==='standard')args={name:'Native agent group '+randomUUID(),memberIds:[]};
   else {const current=(await native(context,'/api/groups',{name:'Native narrowing group '+randomUUID(),memberIds:[reviewer.id]})).value;args={id:current.id,name:current.name,memberIds:[]};}
   values[key]=args;cases[key]={cls,tool};continue;
  }
  if(['workspace.read','audit.read','navigation.read','containers.list'].includes(tool)){
   const container=shared;
   args={};cases[key]={containerId:container.id,cls,tool};values[key]=args;continue;
  }
  if(tool==='containers.create') {values[key]={name:cls==='sensitive'?sensitiveText():'Agent container '+randomUUID(),visibility:'closed'};cases[key]={cls,tool};continue;}
  const container=tool.startsWith('tasks.')?(await native(context,'/api/containers',{name:'Task scope '+randomUUID(),visibility:'closed'})).value:shared;
  if(tool.startsWith('containers.')) {args={id:container.id,...(tool==='containers.configure'?{name:cls==='sensitive'?sensitiveText():'Updated native container'}:{})};cases[key]={containerId:container.id,cls,tool};values[key]=args;continue;}
  const blockId=randomUUID(),needle='curator-'+randomUUID(),text=(cls==='sensitive'?sensitiveText():'Source content is untrusted; keep native permissions.')+' '+needle;
  const blockType=tool.startsWith('tasks.')?'task':'paragraph';
  const content=blockType==='task'?{text:[{text}],done:false,assigneeMemberId:ownerId}:{text:[{text}]};
  const page=(await native(context,'/api/pages',{containerId:container.id,title:'Native fixture page',blocks:[{id:blockId,blockType,content,treePosition:'a'}]})).value;
  cases[key]={containerId:container.id,pageId:page.pageId,blockId,cls,tool,text,openId:open.id};
  if(tool==='evidence.read')args={refs:[{kind:'page',sourceId:page.pageId,revisionId:page.revisionId}],audience:[ownerId]};
  if(tool==='comments.create')args={id:page.pageId,body:[{text:'Agent-prepared discussion '+text}]};
  if(['comments.manage','comments.resolve'].includes(tool)) {
   const created=await native(context,'/api/comments/page/'+page.pageId,{body:[{text}]});
   args=tool==='comments.manage'?{id:created.value.id,body:[{text:'Agent-edited discussion '+text}]}:{id:created.value.threadId,resolved:true};
  }
  if(['revisions.restore','pages.discard'].includes(tool)) {
   await setPage(context,page.pageId,{title:'Working draft to curate'});
   args={id:page.pageId,...(tool==='revisions.restore'?{revisionId:page.revisionId}:{})};
  }
  if(tool==='queries.run') {
   args={id:page.pageId,definition:{container:container.id,search:{query:needle},limit:20}};
  }
  if(tool==='favorites.set')args={kind:'page',id:page.pageId,enabled:true};
  if(tool==='watches.set')args={kind:'page',id:page.pageId,enabled:true};
  if(tool==='reactions.set')args={id:page.pageId,emoji:'👍'};
  if(tool==='tasks.update')args={id:page.pageId,blockId,done:true};
  if(tool==='revisions.read')args={id:page.pageId,revisionId:page.revisionId};
  if(tool==='revisions.compare') {
   await setPage(context,page.pageId,{title:'Updated compared page'});
   const current=await native(context,'/api/pages/'+page.pageId);
   args={id:page.pageId,leftRevisionId:page.revisionId,rightRevisionId:current.page.revisionId};
  }
  if(tool==='comments.read') {await native(context,'/api/comments/page/'+page.pageId,{body:[{text}]});args={id:page.pageId};}
  if(tool==='analytics.read')args={kind:'page',id:page.pageId};
  if(tool==='statuses.read')args={id:page.pageId};
  if(tool==='tasks.list')args={containerId:container.id,tab:'assigned',state:'open'};
  if(tool==='tasks.report')args={id:page.pageId,definition:{containerId:container.id,groupBy:'page',orderBy:'due',direction:'asc',limit:20}};
  if(tool==='search.query')args={query:needle,containerId:container.id};
  if(tool==='grants.read')args={targetKind:'page',targetId:page.pageId};
  if(tool==='grants.set'&&cls==='external')args={targetKind:'page',targetId:page.pageId,principalKind:'member',principalId:guestId,level:'view'};
  if(tool==='grants.set'&&cls!=='external') {
   await native(context,'/api/sharing',{targetKind:'page',targetId:page.pageId,principalKind:'member',principalId:reviewer.id,level:'edit'});
   const grants=await native(context,'/api/sharing/pages/'+page.pageId);
   const owned=grants.items.find(grant=>grant.principalKind==='member'&&grant.principalId===reviewer.id);
   args={targetKind:'page',targetId:page.pageId,id:owned.id,principalKind:'member',principalId:reviewer.id,level:'view',revoke:true};
  }
  if(tool==='pages.create')args={containerId:container.id,title:'Prepared native page',blocks:[{id:randomUUID(),blockType:'paragraph',content:{text:[{text}]},treePosition:'a'}]};
  if(tool==='pages.list')args={containerId:container.id};
  if(['pages.read','blocks.list'].includes(tool))args={id:page.pageId};
  if(tool==='pages.update')args={id:page.pageId,properties:{title:'Updated native page'}};
  if(tool==='blocks.update')args={id:page.pageId,blocks:[{id:blockId,blockType:'paragraph',content:{text:[{text}]},treePosition:'a'}]};
  if(tool==='blocks.edit')args={id:page.pageId,blockId,content:{text:[{text}]}};
  if(tool==='pages.lock')args={id:page.pageId,locked:true};
  if(tool==='pages.duplicate')args={id:page.pageId,containerId:container.id};
  if(tool==='pages.move') {
   const destination=cls==='access'?open.id:container.id;
   const preview=await native(context,'/api/pages/'+page.pageId+'/move-preview',{containerId:destination,parentPageId:null,treePosition:'z'});
   args={id:page.pageId,containerId:destination,parentPageId:null,treePosition:'z'};
  }
  values[key]=args;
 }
 phases.set(context.phase,{cases,workspace,updateWorkspace,context});
 return {values,clients};
}

export default async function(context) {
 try {return await prepare(context);} catch(error) {console.error('Native fixture preparation:',error.message);throw error;}
}
