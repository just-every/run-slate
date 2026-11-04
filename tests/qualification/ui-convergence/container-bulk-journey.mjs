import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {accessible} from './browser-evidence.mjs';
import {call,ok,withSecondPerson} from './two-people-support.mjs';

/** A member selects readable pages through Bulk tools, including a refusal first. */
export async function containerBulkJourney(state,width){
 const {context,origin,api}=state,key=()=>randomUUID();
 const post=(path,input)=>ok(context,origin,'POST',path,{operationKey:key(),...input});
 const source=(await post('/api/containers',{name:'Bulk handover',visibility:'private'})).value.id;
 const destination=(await post('/api/containers',{name:'Bulk destination',visibility:'private'})).value.id;
 for(const [targetId,level] of [[source,'view'],[destination,'edit']])await post('/api/sharing',{targetKind:'container',targetId,principalKind:'member',principalId:'browser-reader',level});
 await post('/api/status',{key:'bulk-ready',label:'Bulk ready',color:'#228855',requiresVerification:false});
 const corpus=[];
 for(const action of ['archive','trash','move','owner','status']){
  const selected=[];
  for(const [index,level] of ['view','full','full'].entries()){
   const title=`Bulk ${action} ${index?'permitted '+index:'refused'}`;
   const id=(await post('/api/pages',{containerId:source,title,blocks:[{id:key(),blockType:'paragraph',treePosition:'a',content:{text:[{text:'Retain the canonical handover text.'}]}}]})).value.pageId;
   if(index||action==='owner')await post('/api/sharing',{targetKind:'page',targetId:id,principalKind:'member',principalId:'browser-reader',level:index?level:'edit'});
   selected.push({id,title});
  }
  // Archive, trash and move must preserve the selected root's descendant edge.
  if(['archive','trash','move'].includes(action)){
   const child=(await post('/api/pages',{containerId:source,parentPageId:selected[1].id,title:`Bulk ${action} child`,blocks:[{id:key(),blockType:'paragraph',treePosition:'a',content:{text:[{text:'Retained child body.'}]}}]})).value.pageId;
   selected[1].child=child;
  }
  corpus.push({action,selected});
 }
 const ids=corpus.flatMap(c=>c.selected.flatMap(p=>[p.id,...(p.child?[p.child]:[])])),sqlIds=ids.map(id=>`'${id}'`).join(',');
 const snapshot=async()=>{
  const tables=[['pages','id'],['page_blocks','page_id'],['page_revisions','page_id'],['page_grants','page_id'],['activity_entries','target_id']];
  return Promise.all((await state.atRest(tables.map(([table,column])=>`SELECT * FROM ${table} WHERE ${column} IN (${sqlIds}) ORDER BY id;`).join('\n'))).map(result=>result.results));
 };
 const before=await snapshot(),commits=[],captures=[];
 await withSecondPerson(state,width,async({bob})=>{
  const {page,context:member}=bob,read=path=>ok(member,origin,'GET',path);
  assert.equal((await read('/api/session')).member.role,'member');
  const openBulk=async()=>{
   await page.goto(`${origin}/app/containers/${source}`,{waitUntil:'networkidle'});
   await page.getByRole('navigation',{name:'Space navigation',exact:true}).getByRole('button',{name:'Bulk',exact:true}).click();
  };
  for(const {action,selected} of corpus){
   for(const [index,p] of selected.entries())assert.equal((await read(`/api/pages/${p.id}`)).permissions.level,index?'full':action==='owner'?'edit':'view');
   await openBulk();
   for(const p of selected)await page.getByRole('checkbox',{name:p.title,exact:true}).check();
   const button=action==='owner'?'Change owner':action==='status'?'Change status':action[0].toUpperCase()+action.slice(1);
   await page.locator('.space-bulk').getByRole('button',{name:button,exact:true}).click();
   const dialog=page.getByRole('dialog',{name:`${action} 3 selected pages`,exact:true});
   if(action==='owner')await dialog.getByRole('combobox',{name:'New owner',exact:true}).selectOption('browser-reader');
   if(action==='status')await dialog.getByRole('combobox',{name:'New status',exact:true}).selectOption('bulk-ready');
   if(action==='move'){
    await dialog.getByRole('combobox',{name:'Destination space',exact:true}).selectOption(destination);
    await dialog.getByRole('button',{name:'Preview access changes',exact:true}).click();
    for(const p of selected)await expect(dialog.locator('details').filter({has:page.locator('summary').filter({hasText:p.title})})).toBeVisible();
    await expect(dialog.locator('details').first()).toContainText('This content isn’t available.');
    for(const p of selected.slice(1)){
     const preview=dialog.locator('details').filter({has:page.locator('summary').filter({hasText:p.title})});
     await preview.locator('summary').click();
     await expect(preview.locator('pre')).toContainText('accessPreviewHash');
    }
   }
   await accessible(page,`bulk ${action} member selection and preview`);
   const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/pages/bulk'&&r.request().method()==='POST');
   await dialog.getByRole('button',{name:'Apply to selected pages',exact:true}).click();
   const response=await pending;
   assert.equal(response.status(),200);
   const input=response.request().postDataJSON(),result=await response.json();
   captures.push(input);
   assert.deepEqual(input.pages.map(p=>p.id),selected.map(p=>p.id));
   assert.deepEqual(result.items.map(p=>[p.id,p.success]),selected.map((p,index)=>[p.id,index!==0]));
   await expect(dialog).toBeHidden();
   const results=page.getByRole('list',{name:'Bulk results',exact:true});
   for(const [index,p] of selected.entries())await expect(results.locator('li').filter({hasText:p.title})).toContainText(index?'Saved':': ');
   for(const p of selected.slice(1)){
    const saved=result.items.find(r=>r.id===p.id).result,receipt=saved.receipt;
    assert.equal(receipt.operationKey,`${input.operationKey}:${p.id}`);
    const entries=(await api('/api/activity?limit=100')).items.filter(e=>e.operationKey===receipt.operationKey);
    assert.equal(entries.length,1);
    assert.equal(entries[0].id,receipt.activityId);
    assert.equal(entries[0].actor.id,'browser-reader');
    assert.equal(entries[0].target.id,p.id);
    assert.equal(entries[0].occurredAt,receipt.committedAt);
    commits.push({action,p,receipt});
    if(action==='owner')assert.equal((await read(`/api/pages/${p.id}`)).properties.ownerMemberId,'browser-reader');
    if(action==='status')assert.equal((await read(`/api/pages/${p.id}`)).properties.statusKey,'bulk-ready');
   }
   assert.deepEqual(await ok(member,origin,'POST','/api/pages/bulk',input),result,'Replay retains the original per-page receipts.');
   await accessible(page,`bulk ${action} named committed and refused results`);
   await page.reload({waitUntil:'networkidle'});
   await page.getByRole('navigation',{name:'Space navigation',exact:true}).getByRole('button',{name:'Bulk',exact:true}).click();
   await expect(page.getByRole('list',{name:'Bulk results',exact:true})).toContainText(selected[0].title);
   await expect(page.getByRole('list',{name:'Bulk results',exact:true})).not.toContainText(selected[0].id);
   if(['archive','trash','move'].includes(action))for(const p of selected.slice(1))await expect(page.getByRole('checkbox',{name:p.title,exact:true})).toHaveCount(0);
   await accessible(page,`bulk ${action} partial failure after reload`);
   console.log(`PROBE CONT-006 ${action}: member native selection of three readable pages -> two commits with individual receipts and activity, one unchanged refusal named after reload; replay retains receipts at ${width}px`);
  }
  // A revoked session cannot replay a previously committed bulk request.
  await member.request.post(origin+'/auth/signout',{headers:{origin}});
  assert.equal((await call(member,origin,'POST','/api/pages/bulk',captures[4])).status,401);
 });
 const after=await snapshot();
 for(const {action,selected} of corpus){
  const refused=selected[0].id;
  for(const [index,column] of ['id','page_id','page_id','page_id','target_id'].entries())assert.deepEqual(after[index].filter(row=>row[column]===refused),before[index].filter(row=>row[column]===refused),'A refused page retains its complete canonical state and activity.');
  for(const p of selected.slice(1)){
   const old=before[0].find(row=>row.id===p.id),row=after[0].find(row=>row.id===p.id),receipt=commits.find(c=>c.p.id===p.id).receipt;
   assert.equal(row.title,old.title);
   assert.equal(row.revision_id,receipt.revisionId);
   assert.equal(row.container_id,action==='move'?destination:source);
   assert.equal(row.parent_page_id,null);
   assert.equal(row.owner_member_id,action==='owner'?'browser-reader':old.owner_member_id);
   assert.equal(row.status_key,action==='status'?'bulk-ready':old.status_key);
   assert.equal(row.archived_at,action==='archive'?receipt.committedAt:null);
   assert.equal(row.trashed_at,action==='trash'?receipt.committedAt:null);
   assert.deepEqual(after[1].filter(b=>b.page_id===p.id),before[1].filter(b=>b.page_id===p.id));
   assert.deepEqual(after[3].filter(g=>g.page_id===p.id),before[3].filter(g=>g.page_id===p.id));
   assert.equal(after[4].filter(e=>e.operation_key===receipt.operationKey).length,1,'Replay creates no additional activity.');
   if(p.child){
    const child=after[0].find(row=>row.id===p.child);
    assert.equal(child.parent_page_id,p.id);
    assert.equal(child.container_id,action==='move'?destination:source);
    assert.equal(child.archived_at,action==='archive'?receipt.committedAt:null);
    assert.equal(child.trashed_at,action==='trash'?receipt.committedAt:null);
    assert.deepEqual(after[1].filter(b=>b.page_id===p.child),before[1].filter(b=>b.page_id===p.child));
   }
  }
 }
}
