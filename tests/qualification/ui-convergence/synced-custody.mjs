import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {ok} from './two-people-support.mjs';
import {checkpoint} from './touch-controls.mjs';
/** The same conversion rule through every destructive source door; no new registration. */
export async function syncedCustodyJourney(state,width){
 const {context,origin,api}=state,key=()=>randomUUID(),browser=context.browser();
 const options={viewport:{width,height:width===390?844:1000},locale:'en-US'};
 const reader=await browser.newContext(options),anonymous=await browser.newContext(options);
 await reader.addCookies([{name:'slate_session',value:state.readerCookie.split('=')[1],url:origin}]);
 const ownerPage=await context.newPage(),readerPage=await reader.newPage(),publicPage=await anonymous.newPage();
 const settings=await api('/api/workspace'),{id:_id,revisionId,...fields}=settings;
 const configure=async policies=>{const current=await api('/api/workspace');await ok(context,origin,'PUT','/api/workspace',{...fields,operationKey:key(),expectedRevisionId:current.revisionId,policies});};
 const failures=[];
 try{
  await configure({...settings.policies,'page.lifecycle.v1':'draft-then-publish'});
  const container=(await ok(context,origin,'POST','/api/containers',{operationKey:key(),name:'Synced custody',visibility:'private'})).value.id;
  const create=async(title,blocks)=>(await ok(context,origin,'POST','/api/pages',{operationKey:key(),containerId:container,title,blocks})).value.pageId;
  const publish=async id=>ok(context,origin,'POST',`/api/pages/${id}/publish`,{operationKey:key(),expectedRevisionId:(await api(`/api/pages/${id}`)).page.revisionId});
  for(const mode of ['delete','remove','unsync','restore','discard']){
   try{
    const title=`Custody source ${mode}`,text=`Retained published content for ${mode}`,draft=`Unpublished replacement for ${mode}`,source=await create(title,[]),blockId=key();
    await publish(source);const empty=await api(`/api/pages/${source}`);
    await ok(context,origin,'PUT',`/api/pages/${source}/blocks`,{operationKey:key(),expectedRevisionId:empty.page.revisionId,blocks:[{id:blockId,blockType:'synced-source',content:{text:[{text}]},treePosition:'0'}]});
    if(mode!=='discard')await publish(source);
    const copy=await create(`Custody copy ${mode}`,[{id:key(),blockType:'synced-reference',content:{sourcePageId:source,sourceBlockId:blockId},treePosition:'0'}]);
    await ok(context,origin,'POST','/api/sharing',{operationKey:key(),targetKind:'page',targetId:copy,principalKind:'member',principalId:'browser-reader',level:'edit'});await publish(copy);
    const old=await api(`/api/pages/${copy}`),before=await api(`/api/revisions/${copy}/${old.workingRevisionId}`);
    const slug=`synthetic-slate-custody-${mode}`;
    await ok(context,origin,'POST',`/api/publishing/${copy}`,{operationKey:key(),expectedRevisionId:old.page.revisionId,host:new URL(origin).host,slug});
    await readerPage.goto(`${origin}/app/pages/${copy}`,{waitUntil:'networkidle'});await expect(readerPage.getByRole('complementary',{name:'Access needed',exact:true})).toBeVisible();await expect(readerPage.locator('body')).not.toContainText(text);await expect(readerPage.locator('body')).not.toContainText(title);
    if(mode==='delete'){
     const live=await api(`/api/pages/${source}`);await ok(context,origin,'PATCH',`/api/pages/${source}/blocks/${blockId}`,{operationKey:key(),expectedRevisionId:live.blocks[0].revisionId,content:{text:[{text:draft}]}});
     const current=await api(`/api/pages/${source}`);await ok(context,origin,'POST',`/api/archive/${source}`,{operationKey:key(),expectedRevisionId:current.page.revisionId,action:'trash'});
     await ownerPage.goto(`${origin}/app/pages/${copy}`,{waitUntil:'networkidle'});try{await expect(ownerPage.getByRole('complementary',{name:'Trashed source',exact:true})).toContainText(`${title} (trashed)`);}catch(error){failures.push(`trash-label: ${error.message}`);}await expect(ownerPage.locator('[data-page-editor]')).not.toContainText(text);await checkpoint(ownerPage,'synced allowed trashed source');
     await readerPage.reload({waitUntil:'networkidle'});await expect(readerPage.getByRole('complementary',{name:'Access needed',exact:true})).toBeVisible();await expect(readerPage.locator('body')).not.toContainText(title);await checkpoint(readerPage,'synced restricted trashed source');
     for(const [actor,label] of [[reader,'restricted'],[context,'trashed']]){
      await ok(actor,origin,'PUT',`/api/pages/${copy}/blocks`,{operationKey:key(),expectedRevisionId:(await api(`/api/pages/${copy}`)).page.revisionId,blocks:[]});
      try{await ok(actor,origin,'POST',`/api/revisions/${copy}/${old.workingRevisionId}/restore`,{operationKey:key(),expectedRevisionId:(await api(`/api/pages/${copy}`)).page.revisionId});}catch(error){failures.push(`copy-restore-${label}: ${error.message}`);}
     }
     await ok(context,origin,'POST',`/api/archive/${source}`,{operationKey:key(),expectedRevisionId:current.page.revisionId,action:'restore'});
     await ownerPage.reload({waitUntil:'networkidle'});await expect(ownerPage.locator('[aria-label="Synced copy"]')).toContainText(draft);
     await ok(context,origin,'POST',`/api/archive/${source}`,{operationKey:key(),expectedRevisionId:current.page.revisionId,action:'trash'});
     await ok(context,origin,'POST',`/api/archive/${source}/permanent-delete`,{operationKey:key(),confirmedPageIds:[source]});
    }else{
     const current=await api(`/api/pages/${source}`);
     if(mode==='restore')await ok(context,origin,'POST',`/api/revisions/${source}/${empty.workingRevisionId}/restore`,{operationKey:key(),expectedRevisionId:current.page.revisionId});
     else if(mode==='discard')await ok(context,origin,'POST',`/api/pages/${source}/discard-changes`,{operationKey:key(),expectedRevisionId:current.page.revisionId});
     else await ok(context,origin,'PUT',`/api/pages/${source}/blocks`,{operationKey:key(),expectedRevisionId:current.page.revisionId,blocks:mode==='remove'?[]:[{id:blockId,blockType:'paragraph',content:{text:[{text}]},treePosition:'0'}]});
    }
    await ownerPage.goto(`${origin}/app/pages/${copy}`,{waitUntil:'networkidle'});await expect(ownerPage.getByRole('region',{name:'Static copy',exact:true})).toContainText(text);await expect(ownerPage.locator('[data-page-editor]')).not.toContainText(draft);await checkpoint(ownerPage,`synced ${mode} static allowed`);
    await readerPage.reload({waitUntil:'networkidle'});await expect(readerPage.getByRole('complementary',{name:'Access needed',exact:true})).toBeVisible();await expect(readerPage.locator('body')).not.toContainText(text);await expect(readerPage.locator('body')).not.toContainText(title);await checkpoint(readerPage,`synced ${mode} static restricted`);
    await publicPage.goto(`${origin}/p/${slug}`,{waitUntil:'networkidle'});await expect(publicPage.locator('body')).toContainText('Access needed');await expect(publicPage.locator('body')).not.toContainText(text);await expect(publicPage.locator('body')).not.toContainText(title);await checkpoint(publicPage,`synced ${mode} static anonymous`);
    const after=await api(`/api/revisions/${copy}/${old.workingRevisionId}`),payload=doc=>JSON.stringify({id:doc.id,properties:doc.properties,createdAt:doc.createdAt,blocks:doc.blocks.map(({synced,...block})=>block)});
    assert.equal(payload(after),payload(before),'The revision door retains byte-identical committed payloads.');
    console.log(`SYNCED_CUSTODY ${mode} ${width}: allowed static, denied and anonymous content-free, history unchanged`);
   }catch(error){failures.push(`${mode}: ${error.stack}`);}
  }
  try{
   const blockId=key(),source=await create('History source',[{id:blockId,blockType:'synced-source',content:{text:[{text:'Committed history content'}]},treePosition:'0'}]);await publish(source);
   const copy=await create('History copy',[{id:key(),blockType:'synced-reference',content:{sourcePageId:source,sourceBlockId:blockId},treePosition:'0'}]);await publish(copy);
   const old=await api(`/api/pages/${copy}`),before=await api(`/api/revisions/${copy}/${old.workingRevisionId}`),current=await api(`/api/pages/${source}`);
   await ok(context,origin,'POST',`/api/archive/${source}`,{operationKey:key(),expectedRevisionId:current.page.revisionId,action:'trash'});await ok(context,origin,'POST',`/api/archive/${source}/permanent-delete`,{operationKey:key(),confirmedPageIds:[source]});
   const after=await api(`/api/revisions/${copy}/${old.workingRevisionId}`),payload=doc=>JSON.stringify({id:doc.id,properties:doc.properties,createdAt:doc.createdAt,blocks:doc.blocks.map(({synced,...block})=>block)});assert.equal(payload(after),payload(before),'Earlier committed history is byte-identical after deletion.');
   await ownerPage.goto(`${origin}/app/pages/${copy}`,{waitUntil:'networkidle'});await expect(ownerPage.locator('[data-page-editor]')).toContainText('Committed history content');await checkpoint(ownerPage,'synced ordinary static and immutable history');
   await ownerPage.goto(`${origin}/app/pages/${copy}?detail=history&revision=${old.workingRevisionId}`,{waitUntil:'networkidle'});
   const preview=ownerPage.locator('.revision-preview');await expect(preview.getByRole('complementary',{name:'Deleted source',exact:true})).toBeVisible();await expect(preview).not.toContainText('Committed history content');await checkpoint(ownerPage,'synced immutable deleted reference in history');
   await preview.getByRole('button',{name:'Restore this revision',exact:true}).click();const restoring=ownerPage.getByRole('dialog',{name:'Restore this revision?',exact:true});await restoring.getByRole('button',{name:'Restore revision',exact:true}).click();await expect(restoring).toBeHidden();
   await ownerPage.goto(`${origin}/app/pages/${copy}`,{waitUntil:'networkidle'});await expect(ownerPage.locator('[data-page-editor]').getByRole('complementary',{name:'Deleted source',exact:true})).toBeVisible();await expect(ownerPage.locator('[data-page-editor]')).not.toContainText('Committed history content');await checkpoint(ownerPage,'synced restored deleted reference stays content free');
   console.log(`SYNCED_CUSTODY history ${width}: ordinary static and immutable prior revision`);
  }catch(error){failures.push(`history: ${error.stack}`);}
 }finally{await ownerPage.close();await reader.close();await anonymous.close();await configure(settings.policies);}
 assert.deepEqual(failures,[],'Every source door keeps content without widening its audience or rewriting history.');
}
/** Run last in the existing review workspace: the member's native session ends on erasure. */
export async function syncedMemberErasureJourney(state,width){
 const {context,origin,api}=state,key=()=>randomUUID(),browser=context.browser();
 const reader=await browser.newContext({viewport:{width,height:width===390?844:1000},locale:'en-US'});
 await reader.addCookies([{name:'slate_session',value:state.readerCookie.split('=')[1],url:origin}]);
 const anonymous=await browser.newContext({viewport:{width,height:width===390?844:1000},locale:'en-US'}),publicPage=await anonymous.newPage();
 const page=await context.newPage(),own=await reader.newPage();
 try{
  const container=(await ok(context,origin,'POST','/api/containers',{operationKey:key(),name:'Personal copy team',visibility:'private'})).value.id;
  await ok(reader,origin,'GET','/api/members/current');
  const personal=(await ok(reader,origin,'GET','/api/containers')).items.find(c=>c.visibility==='personal');assert.ok(personal);
  const text='Personal source retained without a new audience',title='Private member source',blockId=key();
  const source=(await ok(reader,origin,'POST','/api/pages',{operationKey:key(),containerId:personal.id,title,blocks:[{id:blockId,blockType:'synced-source',content:{text:[{text}]},treePosition:'0'}]})).value.pageId;
  const copy=(await ok(context,origin,'POST','/api/pages',{operationKey:key(),containerId:container,title:'Personal source copy'})).value.pageId;
  await ok(context,origin,'POST','/api/sharing',{operationKey:key(),targetKind:'page',targetId:copy,principalKind:'member',principalId:'browser-reader',level:'edit'});
  await ok(reader,origin,'PUT',`/api/pages/${copy}/blocks`,{operationKey:key(),expectedRevisionId:(await api(`/api/pages/${copy}`)).page.revisionId,blocks:[{id:key(),blockType:'synced-reference',content:{sourcePageId:source,sourceBlockId:blockId},treePosition:'0'}]});
  const slug='synthetic-slate-erased-copy';await ok(context,origin,'POST',`/api/publishing/${copy}`,{operationKey:key(),expectedRevisionId:(await api(`/api/pages/${copy}`)).page.revisionId,host:new URL(origin).host,slug});
  await own.goto(`${origin}/app/pages/${copy}`,{waitUntil:'networkidle'});await expect(own.locator('[aria-label="Synced copy"]')).toContainText(text);await checkpoint(own,'synced personal source before erasure');await own.goto('about:blank');
  await page.goto(`${origin}/app/pages/${copy}`,{waitUntil:'networkidle'});await expect(page.getByRole('complementary',{name:'Access needed',exact:true})).toBeVisible();await expect(page.locator('body')).not.toContainText(title);
  await ok(context,origin,'POST','/api/members/remove',{operationKey:key(),memberId:'browser-reader',erase:true});
  await page.reload({waitUntil:'networkidle'});await expect(page.getByRole('complementary',{name:'Access needed',exact:true})).toBeVisible();await expect(page.locator('body')).not.toContainText(text);await expect(page.locator('body')).not.toContainText(title);await checkpoint(page,'synced member erasure no wider audience');
  await publicPage.goto(`${origin}/p/${slug}`,{waitUntil:'networkidle'});await expect(publicPage.locator('body')).toContainText('Access needed');await expect(publicPage.locator('body')).not.toContainText(text);await expect(publicPage.locator('body')).not.toContainText(title);await checkpoint(publicPage,'synced member erasure anonymous access needed');
  console.log(`SYNCED_CUSTODY member-erasure ${width}: deletion accepted, owner receives no private content`);
 }finally{await page.close();await reader.close();await anonymous.close();}
}
