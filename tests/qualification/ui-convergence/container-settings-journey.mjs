import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {inbox,newOutboxLink} from '../../e2e/outbox-auth.mjs';
import {accessible} from './browser-evidence.mjs';
import {call,ok} from './two-people-support.mjs';
import {tap,type} from './touch-controls.mjs';

const administrativeTabs=['Settings','Templates','Trash','Bulk'];
const read=(actor,route)=>ok(actor.context,actor.origin,'GET',route);
const write=(actor,method,route,data)=>ok(actor.context,actor.origin,method,route,data);
const mutation=data=>({operationKey:randomUUID(),...data});

async function corpus(actor,containerId,label){
 const page=(await write(actor,'POST','/api/pages',mutation({containerId,title:`${label} working guide`}))).value;
 const template=(await write(actor,'POST','/api/templates',mutation({sourcePageId:page.pageId,includeChildren:false,containerId,title:`${label} template`,description:'Container-specific response guide.',category:'Operations'}))).value;
 const trash=(await write(actor,'POST','/api/pages',mutation({containerId,title:`${label} discarded guide`}))).value;
 await write(actor,'POST',`/api/archive/${trash.pageId}`,mutation({expectedRevisionId:trash.revisionId,action:'trash',reason:`${label} retired draft`}));
 return {containerId,pageId:page.pageId,templateId:template.id,trashId:trash.pageId,label};
}

async function snapshot(actor,containerId){
 return {
  container:await read(actor,`/api/containers/${containerId}`),
  grants:await read(actor,`/api/sharing/containers/${containerId}`),
  templates:await read(actor,`/api/templates?containerId=${containerId}`),
  pages:await read(actor,`/api/pages?containerId=${containerId}`),
  trash:(await read(actor,'/api/archive')).items.filter(item=>item.containerId===containerId),
 };
}

async function shell(actor,container){
 await actor.page.goto(`${actor.origin}/app/containers/${container.containerId}`,{waitUntil:'networkidle'});
 const navigation=actor.page.getByRole('navigation',{name:'Space navigation',exact:true});
 await navigation.getByRole('button',{name:'Settings',exact:true}).click();
 return actor.page.getByRole('region',{name:`${container.name} settings`,exact:true});
}

async function panes(actor,own,other,{screensOnly=false}={}){
 const {page}=actor;
 let settings=await shell(actor,own);
 await expect(settings.getByRole('heading',{name:'Space settings',exact:true})).toBeVisible();
 await tap(settings.getByRole('button',{name:'Edit details',exact:true}));
 const details=page.getByRole('dialog',{name:'Space details',exact:true});
 if(!screensOnly){
  await expect(details.getByRole('textbox',{name:'Name',exact:true})).toHaveValue(own.name);
  await type(page,details.getByRole('textbox',{name:'Description',exact:true}),`${own.label} administered independently.`);
 }
 await accessible(page,`${own.label} container identity`);
 await tap(details.getByRole('button',{name:screensOnly?'Close dialog':'Save settings',exact:true}));
 await expect(details).toBeHidden();
 if(!screensOnly)assert.equal((await read(actor,`/api/containers/${own.containerId}`)).description,`${own.label} administered independently.`);

 const access=settings.locator('details.space-access-details');
 await tap(access.locator('summary'));
 const grants=await read(actor,`/api/sharing/containers/${own.containerId}`);
 if(!screensOnly){
  const rows=settings.locator('.settings-list li');
  assert.equal(await rows.count(),grants.items.length,'Every native grant is rendered in this container.');
  for(const grant of grants.items)await expect(rows.filter({hasText:grant.principalLabel})).toContainText(grant.level);
 }
 await accessible(page,`${own.label} container members and grants`);
 if(!screensOnly){
  const row=settings.locator('.settings-list li').filter({hasText:other.member.displayName});
  await tap(row.getByRole('button',{name:'Edit access',exact:true}));
  const grant=page.getByRole('dialog',{name:'Space access grant',exact:true});
  await grant.getByRole('combobox',{name:'Access',exact:true}).selectOption('comment');
  await tap(grant.getByRole('button',{name:'Save access',exact:true}));
  await expect(grant).toBeHidden();
  assert.equal((await read(actor,`/api/sharing/containers/${own.containerId}`)).items.find(item=>item.principalId===other.member.id).level,'comment');
 }
 await tap(settings.getByRole('button',{name:'Visibility & public access',exact:true}));
 const switches=page.getByRole('dialog',{name:'Space access',exact:true});
 const names=['Guest access','Public link access','Anonymous access'];
 for(const name of names){
  await expect(switches.getByRole('combobox',{name,exact:true})).toBeVisible();
  if(!screensOnly)await switches.getByRole('combobox',{name,exact:true}).selectOption('forbidden');
 }
 await accessible(page,`${own.label} container external switches`);
 await tap(switches.getByRole('button',{name:screensOnly?'Close dialog':'Save settings',exact:true}));
 await expect(switches).toBeHidden();
 if(!screensOnly){
  const current=await read(actor,`/api/containers/${own.containerId}`);
  for(const key of ['guestAccess','publicLinkAccess','anonymousAccess'])assert.equal(current[key],'forbidden');
 }

 const navigation=page.getByRole('navigation',{name:'Space navigation',exact:true});
 for(const tab of ['Templates','Trash','Bulk']){
  await tap(navigation.getByRole('button',{name:tab,exact:true}));
  settings=page.getByRole('region',{name:`${own.name} settings`,exact:true});
  await expect(settings).toBeVisible();
  if(tab==='Templates'){
   await expect(settings.getByRole('combobox',{name:'Collection',exact:true})).toHaveValue(own.containerId);
   await expect(settings.getByRole('combobox',{name:'Collection',exact:true})).toBeDisabled();
   await expect(settings.getByRole('heading',{name:`${own.label} template`,exact:true})).toBeVisible();
   if(!screensOnly){
    const templates=await read(actor,`/api/templates?containerId=${own.containerId}`);
    assert.deepEqual((await settings.locator('.template-choice h3').allTextContents()).sort(),templates.items.map(item=>item.title).sort());
    await expect(settings).not.toContainText(`${other.label} template`);
   }
  }else if(tab==='Trash'){
   await expect(settings.getByRole('heading',{name:`${own.label} discarded guide`,exact:true})).toBeVisible();
   if(!screensOnly){
    const trash=(await read(actor,'/api/archive')).items.filter(item=>item.containerId===own.containerId&&item.trashedAt);
    assert.deepEqual((await settings.locator('.archive-list h2').allTextContents()).sort(),trash.map(item=>item.title).sort());
    await expect(settings).not.toContainText(`${other.label} discarded guide`);
   }
  }else{
   await expect(settings.getByRole('heading',{name:'Bulk tools',exact:true})).toBeVisible();
   await expect(settings.getByRole('checkbox',{name:`${own.label} working guide`,exact:true})).toBeVisible();
   if(!screensOnly){
    const pages=await read(actor,`/api/pages?containerId=${own.containerId}`);
    assert.deepEqual((await settings.locator('.bulk-page-list label').allTextContents()).sort(),pages.items.map(item=>item.title).sort());
    await expect(settings).not.toContainText(`${other.label} working guide`);
    for(const action of ['Archive','Trash','Move','Change owner','Change status'])await expect(settings.getByRole('button',{name:action,exact:true})).toBeVisible();
   }
  }
  await accessible(page,`${own.label} container ${tab.toLowerCase()}`);
 }
}

/** Two ordinary administrators share read access, without sharing administrative authority. */
export async function containerSettingsJourney(state,touch,{screensOnly=false}={}){
 const {origin}=state;
 const width=touch.page.viewportSize().width;
 const context=await state.context.browser().newContext({viewport:touch.page.viewportSize(),hasTouch:true,isMobile:width===390});
 try{
  const beforeMail=await inbox(origin);
  await ok(state.context,origin,'POST','/api/invitations',mutation({email:[`synthetic-slate-container-${width}`,'test.invalid'].join('@'),kind:'member'}));
  const link=new URL(await newOutboxLink(origin,beforeMail));
  assert.equal((await context.request.post(origin+'/api/auth/invitation/accept',{headers:{origin},form:{token:link.searchParams.get('token')},maxRedirects:0})).status(),303);
  const second={context,page:await context.newPage(),origin};
  const first={context:touch.context,page:touch.page,origin};
  const firstMember=await read(first,'/api/members/current'),secondMember=await read(second,'/api/members/current');
  assert.equal(firstMember.role,'member');assert.equal(secondMember.role,'member');
  assert.notEqual(firstMember.id,secondMember.id);
  const secondSpace=(await write(second,'POST','/api/containers',mutation({name:'Secondary operations',visibility:'private'}))).value;
  const a={...await corpus(first,touch.containerId,'Primary'),name:touch.containerName,member:firstMember};
  const b={...await corpus(second,secondSpace.id,'Secondary'),name:secondSpace.name,member:secondMember};
  for(const [admin,own,viewer] of [[first,a,b],[second,b,a]])await write(admin,'POST','/api/sharing',mutation({targetKind:'container',targetId:own.containerId,principalKind:'member',principalId:viewer.member.id,level:'view'}));
  const workspace=await state.api('/api/workspace');
  if(screensOnly){
   await panes(first,a,b,{screensOnly:true});
   await first.page.goto(`${origin}/app/containers/${b.containerId}`,{waitUntil:'networkidle'});
   await accessible(first.page,'phone reader has no foreign container administration');
   return;
  }
  for(const [admin,own,foreign,foreignAdmin] of [[first,a,b,second],[second,b,a,first]]){
   const beforeOther=await snapshot(foreignAdmin,foreign.containerId);
   await panes(admin,own,foreign);
   await admin.page.reload({waitUntil:'networkidle'});
   await shell(admin,own);
   const current=await read(admin,`/api/containers/${own.containerId}`);
   assert.equal(current.permissions.canManage,true);
   assert.equal(current.description,`${own.label} administered independently.`);
   assert.deepEqual(await snapshot(foreignAdmin,foreign.containerId),beforeOther,'Administering one container changes no foreign container, grant, template, page or trash.');
   assert.deepEqual(await state.api('/api/workspace'),workspace,'Container settings never change workspace settings or its revision.');
   const beforeOwn=await snapshot(admin,own.containerId);
   await admin.page.goto(`${origin}/app/containers/${foreign.containerId}`,{waitUntil:'networkidle'});
   const navigation=admin.page.getByRole('navigation',{name:'Space navigation',exact:true});
   assert.equal((await read(admin,`/api/containers/${foreign.containerId}`)).permissions.canManage,false);
   for(const tab of administrativeTabs)await expect(navigation.getByRole('button',{name:tab,exact:true})).toHaveCount(0);
   await expect(admin.page.getByRole('region',{name:`${foreign.name} settings`,exact:true})).toHaveCount(0);
   await accessible(admin.page,`${own.label} can read another container without administrative entry points`);
   const target=beforeOther.container;
   const attempts=[
    ['GET',`/api/sharing/containers/${foreign.containerId}`,undefined,403],
    ['PATCH',`/api/containers/${foreign.containerId}`,mutation({expectedRevisionId:target.revisionId,description:'Refused foreign administration'}),403],
    ['POST','/api/sharing/container-settings',mutation({id:foreign.containerId,expectedRevisionId:target.revisionId,visibility:'open',guestAccess:'allowed',publicLinkAccess:'allowed',anonymousAccess:'allowed'}),403],
    ['POST','/api/sharing',mutation({targetKind:'container',targetId:foreign.containerId,principalKind:'member',principalId:own.member.id,level:'full'}),403],
    ['POST',`/api/containers/${foreign.containerId}/archive`,mutation({expectedRevisionId:target.revisionId}),404],
   ];
   for(const [method,route,data,status] of attempts){
    const response=await call(admin.context,origin,method,route,data);
    assert.equal(response.status,status,`${method} ${route} refuses another container's administrator.`);
   }
   const template=await read(foreignAdmin,`/api/templates/${foreign.templateId}`);
   assert.equal((await call(admin.context,origin,'POST',`/api/templates/${foreign.templateId}/change`,mutation({expectedRevisionId:template.revisionId,action:'delete'}))).status,404);
   const page=await read(foreignAdmin,`/api/pages/${foreign.pageId}`);
   const bulk=await write(admin,'POST','/api/pages/bulk',mutation({action:'trash',pages:[{id:foreign.pageId,expectedRevisionId:page.page.revisionId}]}));
   assert.equal(bulk.items.length,1);assert.equal(bulk.items[0].success,false);
   const trash=beforeOther.trash.find(item=>item.id===foreign.trashId);
   assert.equal((await call(admin.context,origin,'POST',`/api/archive/${foreign.trashId}`,mutation({expectedRevisionId:trash.revisionId,action:'restore'}))).status,404);
   await admin.page.goto(origin+'/app/settings?section=workspace',{waitUntil:'networkidle'});
   await expect(admin.page.getByRole('button',{name:'Edit workspace & policies',exact:true})).toHaveCount(0);
   const {name,mark,description,guestAccess,publicLinkAccess,anonymousAccess,policies}=workspace;
   assert.equal((await call(admin.context,origin,'PUT','/api/workspace',mutation({expectedRevisionId:workspace.revisionId,name,mark,description:'Refused workspace administration',guestAccess,publicLinkAccess,anonymousAccess,policies}))).status,403);
   assert.deepEqual(await state.api('/api/workspace'),workspace);
   assert.deepEqual(await snapshot(foreignAdmin,foreign.containerId),beforeOther,'Refused administration leaves the complete foreign container unchanged.');
   assert.deepEqual(await snapshot(admin,own.containerId),beforeOwn,'Refused foreign operations do not mutate the administrator own container.');
  }
  // Workspace owners retain administration even without membership or a content grant.
  for(const own of [a,b]){
   const owner={context:state.context,page:state.page,origin};
   assert.equal((await read(owner,`/api/containers/${own.containerId}`)).permissions.canManage,true);
   const settings=await shell(owner,own);
   await expect(settings.getByRole('button',{name:'Edit details',exact:true})).toBeVisible();
   const current=await read(owner,`/api/containers/${own.containerId}`);
   await write(owner,'PATCH',`/api/containers/${own.containerId}`,mutation({expectedRevisionId:current.revisionId,description:current.description}));
  }
  assert.deepEqual(await state.api('/api/workspace'),workspace);
  console.log('CONT-004 PROBE inventory: identity, members and grants, three switches, scoped templates, trash and bulk tools reached; two administrators allowed on their own container and refused across containers and workspace; snapshots unchanged; workspace-owner administration retained.');
 }finally{await context.close();}
}
