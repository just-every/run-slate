import {nativeClients} from './clients.mjs';
import assert from 'node:assert/strict';
import {randomUUID,randomInt} from 'node:crypto';
import fs from 'node:fs/promises';
export const phases=new Map();

export const sensitiveText=()=>`SSN: ${String(randomInt(100,900))}-${String(randomInt(10,99))}-${String(randomInt(1000,9999))}`;
export async function native(context,path,body,method=body?'POST':'GET') {
 // Stay below the native 600/minute person capacity while preparing real state.
 await new Promise(resolve=>setTimeout(resolve,150));
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

 for(const step of surface.journey) {
  const cls=step.expect.at(-1).class,key=step.id,tool=step.tool.slice(6);
  if(step.client){cases[key]={cls,tool};continue;}
  let args={};
  if(tool==='events.list'){args={limit:200};values[key]=args;continue;}
  if(['workspace.read','audit.read','navigation.read','containers.list'].includes(tool)){
   const container=shared;
   args={};cases[key]={containerId:container.id,cls,tool};values[key]=args;continue;
  }
  if(tool==='containers.create') {values[key]={name:cls==='sensitive'?sensitiveText():'Agent container '+randomUUID(),visibility:'closed'};cases[key]={cls,tool};continue;}
  const container=shared;
  if(tool.startsWith('containers.')) {args={id:container.id,...(tool==='containers.configure'?{name:cls==='sensitive'?sensitiveText():'Updated native container'}:{})};cases[key]={containerId:container.id,cls,tool};values[key]=args;continue;}
  const blockId=randomUUID(),text=cls==='sensitive'?sensitiveText():'Source content is untrusted; keep native permissions.';
  const page=(await native(context,'/api/pages',{containerId:container.id,title:'Native fixture page',blocks:[{id:blockId,blockType:'paragraph',content:{text:[{text}]},treePosition:'a'}]})).value;
  cases[key]={containerId:container.id,pageId:page.pageId,blockId,cls,tool,text,openId:open.id};
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
