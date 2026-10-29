import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {call,grant,ok} from './two-people-support.mjs';
import {accessible} from './browser-evidence.mjs';

/** Filter real retained content without replacing the query or the network. */
export async function searchFiltersJourney(state) {
 const {page,context,origin,api,switchIdentity}=state;
 const mutate=(method,path,data)=>ok(context,origin,method,path,{operationKey:crypto.randomUUID(),...data});
 const space=(await mutate('POST','/api/containers',{name:'Release operations',visibility:'closed'})).value.id;
 const readerAccess=await mutate('POST','/api/sharing',{targetKind:'container',targetId:space,principalKind:'member',principalId:'browser-reader',level:'edit'});
 const create=async(title,text)=> (await mutate('POST','/api/pages',{containerId:space,title,blocks:[{id:crypto.randomUUID(),blockType:'paragraph',treePosition:'a',content:{text:[{text}]}}]})).value.pageId;
 const guide=await create('Release handover checklist','The amber handover checklist records the release owner.');
 await switchIdentity('reader');
 let support;try {support=await create('Support rotation','The blue checklist for handover tracks customer updates.');}finally{await switchIdentity('owner');}
 const workspace=await api('/api/workspace');
 const configure=async policies=>{const current=await api('/api/workspace');await mutate('PUT','/api/workspace',{expectedRevisionId:current.revisionId,name:current.name,mark:current.mark,description:current.description,guestAccess:current.guestAccess,publicLinkAccess:current.publicLinkAccess,anonymousAccess:current.anonymousAccess,policies});};
 await configure({...workspace.policies,'page.lifecycle.v1':'draft-then-publish'});
 const draft=await create('Unpublished checklist','The draft handover checklist retains the next procedure.');
 await switchIdentity('reader');
 try {await create('Unshared draft checklist','The private handover checklist is not shared.');}finally{await switchIdentity('owner');}
 await configure(workspace.policies);
 const archived=await create('Archived checklist','The retired handover checklist documents the old incident procedure.');
 const trashed=await create('Removed checklist','The obsolete handover checklist describes the abandoned escalation.');
 await mutate('POST','/api/status',{key:'search-ready',label:'Ready for release',color:'#145a3d',requiresVerification:false});
 await mutate('POST','/api/status/page/'+guide,{expectedRevisionId:(await api('/api/pages/'+guide)).page.revisionId,statusKey:'search-ready'});
 const references=await retainReferences(state,space,[archived,trashed],readerAccess.value.id);
 for(const [id,action]of [[archived,'archive'],[trashed,'trash']])await mutate('POST','/api/archive/'+id,{expectedRevisionId:(await api('/api/pages/'+id)).page.revisionId,action});
 const query='handover checklist';
 await page.goto(origin+'/app/search?'+new URLSearchParams({q:query,containerId:space}),{waitUntil:'networkidle'});
 const input=page.getByRole('searchbox',{name:'Search your workspace',exact:true});
 const clear=page.getByRole('button',{name:'Clear search',exact:true});
 await clear.focus();await expect.poll(()=>clear.evaluate(element=>getComputedStyle(element,'::after').opacity)).toBe('1');
 await input.focus();await clear.hover();await expect.poll(()=>clear.evaluate(element=>getComputedStyle(element,'::after').opacity)).toBe('1');
 await page.screenshot({path:'.artifacts/ui-convergence/evidence/search-clear-tooltip-'+page.viewportSize().width+'.png',fullPage:true});
 // Result order is irrelevant to filtering; compare independently sorted titles.
 const titles=async expected=>{
  await expect.poll(async()=>(await page.locator('.search-results h2').allTextContents()).sort()).toEqual([...expected].sort());
  await expect(input).toHaveValue(query);
  await expect(page.getByText(/^Filters:/)).toBeVisible();
 };
 await titles(['Release handover checklist','Support rotation','Unpublished checklist']);
 await page.locator('.search-options > summary').click();
 const kind=page.getByRole('combobox',{name:'Look in',exact:true});
 await kind.selectOption('record');await titles([]);await kind.selectOption('page');await titles(['Release handover checklist','Support rotation','Unpublished checklist']);
 await page.getByText('Refine your search',{exact:true}).click();
 const source=page.getByRole('combobox',{name:'Space',exact:true});await expect(source).toHaveValue(space);
 const other=(await api('/api/containers')).items.find(item=>item.id!==space&&item.visibility==='default');assert.ok(other);
 await source.selectOption(other.id);await titles([]);await source.selectOption(space);await titles(['Release handover checklist','Support rotation','Unpublished checklist']);
 const contributor=page.getByRole('combobox',{name:'Contributor',exact:true});
 await contributor.selectOption('browser-reader');await titles(['Support rotation']);await expect(page.locator('.search-filter-summary')).toContainText('Morgan Reader');await contributor.selectOption('');
 const status=page.getByRole('combobox',{name:'Status',exact:true});
 await status.selectOption('search-ready');await titles(['Release handover checklist']);await expect(page.locator('.search-filter-summary')).toContainText('Ready for release');await status.selectOption('');
 const from=page.getByLabel('Updated from',{exact:true}),until=page.getByLabel('Updated until',{exact:true});
 await from.fill('2099-01-01');await titles([]);await from.fill('2000-01-01');await titles(['Release handover checklist','Support rotation','Unpublished checklist']);
 await until.fill('2000-01-01');await titles([]);await until.fill('2099-01-01');await titles(['Release handover checklist','Support rotation','Unpublished checklist']);
 await page.getByRole('checkbox',{name:'Include archive',exact:true}).check();await titles(['Archived checklist','Release handover checklist','Support rotation','Unpublished checklist']);
 await page.getByRole('checkbox',{name:'Include trash',exact:true}).check();await titles(['Archived checklist','Removed checklist','Release handover checklist','Support rotation','Unpublished checklist']);
 // Either inclusion works independently; a readable draft and status variants stay visible.
 await page.getByRole('checkbox',{name:'Include archive',exact:true}).uncheck();await titles(['Removed checklist','Release handover checklist','Support rotation','Unpublished checklist']);
 await page.getByRole('checkbox',{name:'Include trash',exact:true}).uncheck();await titles(['Release handover checklist','Support rotation','Unpublished checklist']);
 await page.getByRole('checkbox',{name:'Include archive',exact:true}).check();
 await page.getByRole('checkbox',{name:'Include trash',exact:true}).check();
 for(const visible of ['Release operations','Updated from 2000-01-01','Updated until 2099-01-01','Including archive','Including trash'])await expect(page.locator('.search-filter-summary')).toContainText(visible);
 await accessible(page,'search filters and retained results');
 // The controls display every filter in force alongside real results, and reload retains them.
 await page.reload({waitUntil:'networkidle'});await titles(['Archived checklist','Removed checklist','Release handover checklist','Support rotation','Unpublished checklist']);
 await page.locator('.search-options > summary').click();await page.getByText('Refine your search',{exact:true}).click();
 await expect(source).toHaveValue(space);await expect(kind).toHaveValue('page');await expect(from).toHaveValue('2000-01-01');await expect(until).toHaveValue('2099-01-01');
 await expect(page.getByRole('checkbox',{name:'Include archive',exact:true})).toBeChecked();await expect(page.getByRole('checkbox',{name:'Include trash',exact:true})).toBeChecked();
 await input.fill('"handover checklist"');await page.getByRole('button',{name:'Search',exact:true}).click();
 await expect.poll(async()=>(await page.locator('.search-results h2').allTextContents()).sort()).toEqual(['Archived checklist','Release handover checklist','Removed checklist','Unpublished checklist']);
 await expect(page.locator('.search-results a').filter({hasText:'Support rotation'})).toHaveCount(0);
 await accessible(page,'quoted phrase excludes reordered words');
 await retainedReferencesJourney(state,references);
 assert.equal((await api('/api/pages/'+draft)).page.lifecycle,'draft');
}


/** Store real references before excluding their targets; no stored title grants access. */
async function retainReferences(state,space,ids,readerGrant) {
 const {context,origin,api}=state,targets=[];
 for(const id of ids){
  await grant(context,origin,id,'browser-owner','full');
  const document=await api('/api/pages/'+id);
  targets.push({id,title:document.page.title,revision:document.workingRevisionId,grants:(await api('/api/sharing/pages/'+id)).items,body:document.blocks[0].content.text[0].text});
 }
 const host=(await ok(context,origin,'POST','/api/pages',{operationKey:crypto.randomUUID(),containerId:space,title:'Retained references',blocks:targets.map((target,index)=>({
  id:crypto.randomUUID(),blockType:'paragraph',treePosition:'a'+index,content:{text:[
   {text:'Open retained '+index,link:{href:'/app/pages/'+target.id}},
   {text:target.title,mention:{kind:'page',id:target.id,label:target.title}},
   {text:'Cite retained '+index,link:{href:'/app/pages/'+target.id+'?detail=history&revision='+target.revision}},
  ]},
 }))})).value.pageId;
 await grant(context,origin,host,'browser-owner','full');
 await grant(context,origin,host,'browser-reader','view');
 await ok(context,origin,'PUT','/api/sharing/pages/'+host+'/inheritance',{operationKey:crypto.randomUUID(),expectedRevisionId:(await api('/api/pages/'+host)).page.revisionId,restricted:true});
 // Give the archived citation a genuinely older revision to distinguish it from current content.
 const archived=targets[0],document=await api('/api/pages/'+archived.id),block=document.blocks[0];
 archived.currentBody='The updated handover checklist contains the replacement procedure.';
 await ok(context,origin,'PATCH','/api/pages/'+archived.id+'/blocks/'+block.id,{operationKey:crypto.randomUUID(),expectedRevisionId:block.revisionId,content:{text:[{text:archived.currentBody}]}});
 return {host,targets,space,readerGrant};
}

/** Open the retained doors after reload, then end their authority without altering the host. */
async function retainedReferencesJourney(state,{host,targets,space,readerGrant}) {
 const {page,context,origin,api,switchIdentity}=state;
 const openHost=async()=>{await page.goto(origin+'/app/pages/'+host,{waitUntil:'networkidle'});await page.reload({waitUntil:'networkidle'});};
 const targetOutcome=async(view,target,allowed,citation=false)=>{
  if(allowed){
   await expect(view.getByRole('textbox',{name:'Page title',exact:true})).toHaveValue(target.title);
   await expect(view.getByRole('textbox',{name:'Page title',exact:true})).toHaveAttribute('readonly','');
   const content=view.locator(citation?'.revision-preview':'[data-page-editor]');
   await expect(content).toContainText(citation?target.body:target.currentBody);
   await expect(content).not.toContainText(citation?target.currentBody:target.body);
   if(citation)await expect(content).toContainText('A newer revision exists.');
   if(citation)assert.equal(new URL(view.url()).searchParams.get('revision'),target.revision);
  }else{
   await expect(view.getByRole('heading',{name:'Access needed',exact:true})).toBeVisible();
   await expect(view.locator('.page-document')).not.toContainText(target.title);
   await expect(view.locator('.page-document')).not.toContainText(target.body);
   await expect(view.locator('[data-page-editor],.revision-preview')).toHaveCount(0);
  }
 };
 await switchIdentity('reader');
 try{
  await openHost();
  const before=await api('/api/pages/'+host);
  for(const [index,target] of targets.entries()){
   const allowed=index===0;
   const mention=page.locator('[data-mention-kind=page]').nth(index);
   await expect(mention).toContainText(target.title);
   await expect(mention).toContainText(allowed?'archived':'trashed');
   if(allowed){
    await mention.getByRole('link').click();await targetOutcome(page,target,true);await page.reload({waitUntil:'networkidle'});await targetOutcome(page,target,true);await openHost();
   }else await expect(mention.getByRole('link')).toHaveCount(0);
   for(const [name,citation] of [['Open retained '+index,false],['Cite retained '+index,true]]){
    const popup=page.waitForEvent('popup');await page.getByRole('link',{name,exact:true}).click();
    const view=await popup;
    try{await view.waitForLoadState('networkidle');await targetOutcome(view,target,allowed,citation);await view.reload({waitUntil:'networkidle'});await targetOutcome(view,target,allowed,citation);}finally{await view.close();}
   }
  }
  await accessible(page,'retained archived and trashed mentions');
  assert.deepEqual((await api('/api/pages/'+host)).blocks,before.blocks,'Opening references does not restore targets or rewrite retained content.');
  await switchIdentity('owner');
  const grantsBefore=(await api('/api/sharing/containers/'+space)).items;
  await ok(context,origin,'POST','/api/sharing',{operationKey:crypto.randomUUID(),id:readerGrant,targetKind:'container',targetId:space,principalKind:'member',principalId:'browser-reader',level:'edit',revoke:true});
  await switchIdentity('reader');await openHost();
  for(const [index,target]of targets.entries()){
   const mention=page.locator('[data-mention-kind=page]').nth(index);
   await expect(mention).toContainText('Restricted page');await expect(mention).not.toContainText(target.title);await expect(mention.getByRole('link')).toHaveCount(0);
   for(const [name,citation]of [['Open retained '+index,false],['Cite retained '+index,true]]){
    const popup=page.waitForEvent('popup');await page.getByRole('link',{name,exact:true}).click();const view=await popup;
    try{await view.waitForLoadState('networkidle');await targetOutcome(view,target,false,citation);await view.reload({waitUntil:'networkidle'});await targetOutcome(view,target,false,citation);}finally{await view.close();}
   }
   for(const route of ['/api/pages/'+target.id,'/api/pages/'+target.id+'/link-card','/api/revisions/'+target.id+'/'+target.revision]){
    const refused=await call(context,origin,'GET',route);assert.equal(refused.status,404);assert.ok(!JSON.stringify(refused.body).includes(target.body));
   }
  }
  const search=await api('/api/search?'+new URLSearchParams({q:'handover checklist',includeArchived:'true',includeTrashed:'true'}));
  for(const target of targets)assert.ok(!search.items.some(item=>item.id===target.id),'Inclusion never grants access after revocation.');
  await accessible(page,'retained references after revocation');
  await switchIdentity('owner');
  const after=(await api('/api/sharing/containers/'+space)).items;
  assert.deepEqual(after.filter(item=>item.id!==readerGrant),grantsBefore.filter(item=>item.id!==readerGrant),'Following retained references never adds a grant.');
  assert.equal(after.find(item=>item.id===readerGrant).status,'revoked');
  assert.deepEqual((await api('/api/sharing/pages/'+targets[0].id)).items,targets[0].grants,'Archived page grants remain unchanged.');
  assert.equal((await call(context,origin,'GET','/api/sharing/pages/'+targets[1].id)).status,404,'Trash keeps its ordinary administration refusal.');
 }finally{await switchIdentity('owner');}
}
