import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {expect} from '@playwright/test';
import {ok} from './two-people-support.mjs';

/** Native ordinary-page writes retain every snapshot after subsequent edits and reload. */
export async function revisionSnapshotsJourney(state,width) {
 const {page,context,origin,api}=state;
 const workspace=await api('/api/workspace');
 const profile=async policies=>ok(context,origin,'PUT','/api/workspace',{operationKey:randomUUID(),expectedRevisionId:(await api('/api/workspace')).revisionId,name:workspace.name,mark:workspace.mark,description:workspace.description,guestAccess:workspace.guestAccess,publicLinkAccess:workspace.publicLinkAccess,anonymousAccess:workspace.anonymousAccess,policies});
 const directory=`.artifacts/ui-convergence/revision-snapshots-${width}`;
 await mkdir(directory,{recursive:true});
 const retained=[];
 const firstBody='Cafe\u0301\t  first snapshot',laterBody='synthetic-slate-later-body';
 const blockId=randomUUID(),containerId=(await api('/api/containers')).items.find(item=>item.name==='Handbook').id;
 let properties={title:'synthetic-slate-initial-snapshot',icon:'📘',coverFileId:null,ownerMemberId:'browser-owner',statusKey:null,labels:['alpha','zeta'],typeface:'serif',smallText:false,fullWidth:true};
 let body=firstBody,pageId;
 const record=async(result,originKind,label=null)=>{
  const {receipt,value}=result;
  assert.equal(value.revisionId,receipt.revisionId);
  assert.ok(!retained.some(item=>item.receipt.revisionId===receipt.revisionId));
  const document=await api(`/api/pages/${pageId}`);
  assert.equal(document.page.revisionId,receipt.revisionId);
  assert.deepEqual(document.properties,properties,'Every committed property agrees with the native input.');
  assert.equal(document.blocks.length,1);
  assert.deepEqual(document.blocks[0],{id:blockId,pageId,parentBlockId:null,blockType:'paragraph',treePosition:'1',content:{text:[{text:body}]},revisionId:document.blocks[0].revisionId});
  const expectedText=`${body} alpha zeta ${properties.title}`.normalize('NFC').replace(/\s+/gu,' ').trim();
  const expectedHash=createHash('sha256').update(expectedText).digest('hex');
  const snapshot=await api(`/api/revisions/${pageId}/${receipt.revisionId}`);
  assert.deepEqual(snapshot,{id:receipt.revisionId,blocks:document.blocks,properties,createdAt:receipt.committedAt,newerRevisionExists:false});
  const history=(await api(`/api/revisions/${pageId}`)).items;
  assert.deepEqual(new Set(history.map(item=>item.id)),new Set([...retained.map(item=>item.receipt.revisionId),receipt.revisionId]),'Every returned revision is retained, with no unaccounted snapshot.');
  assert.deepEqual(history.find(item=>item.id===receipt.revisionId),{id:receipt.revisionId,origin:originKind,authorMemberId:'browser-owner',authorDisplayName:'Alex Owner',ordinal:null,label,statusKey:null,createdAt:receipt.committedAt,deletedAt:null,deletedByMemberId:null,deletedByDisplayName:null});
  retained.push({receipt,origin:originKind,label,expectedText,expectedHash,snapshot:structuredClone(snapshot)});
 };
 const change=async(method,path,action)=>{
  const response=page.waitForResponse(response=>new URL(response.url()).pathname===path&&response.request().method()===method);
  await action();
  const returned=await response;
  assert.equal(returned.status(),200,await returned.text());
  return returned.json();
 };
 try {
  await profile({...workspace.policies,'page.lifecycle.v1':'draft-then-publish','page.version.v1':'autosnapshot'});
  const created=await ok(context,origin,'POST','/api/pages',{operationKey:randomUUID(),containerId,title:properties.title,properties,blocks:[{id:blockId,blockType:'paragraph',treePosition:'1',content:{text:[{text:body}]}}]});
  pageId=created.value.pageId;
  await record(created,'autosave');
  await page.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});
  const title=page.getByRole('textbox',{name:'Page title',exact:true});
  properties={...properties,title:'Cafe\u0301  revised snapshot'};
  await record(await change('PATCH',`/api/pages/${pageId}`,async()=>{await title.fill(properties.title);await title.press('Tab');}),'autosave');
  body='synthetic-slate-published-body';
  await record(await change('PATCH',`/api/pages/${pageId}/blocks/${blockId}`,()=>page.getByRole('textbox',{name:'Paragraph',exact:true}).fill(body)),'autosave');
  await expect(page.getByRole('status').filter({hasText:/^Saved$/}).first()).toBeVisible();
  await page.getByRole('button',{name:'More',exact:true}).click();
  await page.getByRole('menuitem',{name:'Publish workspace revision',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Publish this revision',exact:true});
  await expect(dialog.getByRole('region',{name:'Workspace publication preview'})).toContainText(body);
  await dialog.getByRole('button',{name:'Review publication',exact:true}).click();
  await expect(dialog.getByRole('region',{name:'Reviewed publication'})).toBeVisible();
  await record(await change('POST',`/api/pages/${pageId}/publish`,()=>dialog.getByRole('button',{name:'Publish workspace revision',exact:true}).click()),'publish','');
  await expect(dialog).toBeHidden();
  properties={...properties,title:'synthetic-slate-later-title'};
  await record(await change('PATCH',`/api/pages/${pageId}`,async()=>{await title.fill(properties.title);await title.press('Tab');}),'autosave');
  body=laterBody;
  await record(await change('PATCH',`/api/pages/${pageId}/blocks/${blockId}`,()=>page.getByRole('textbox',{name:'Paragraph',exact:true}).fill(body)),'autosave');
  await page.reload({waitUntil:'networkidle'});
  for(const [index,item] of retained.entries()){
   const id=item.receipt.revisionId;
   assert.deepEqual(await api(`/api/revisions/${pageId}/${id}`),{...item.snapshot,newerRevisionExists:index!==retained.length-1});
   await page.goto(`${origin}/app/pages/${pageId}?detail=history&revision=${id}`,{waitUntil:'networkidle'});
   await page.reload({waitUntil:'networkidle'});
   const preview=page.locator('.revision-preview');
   await expect(preview.getByRole('heading',{level:3})).toHaveText(item.snapshot.properties.title);
   await expect(preview).toContainText(item.snapshot.blocks[0].content.text[0].text.replace(/\s+/gu,' '));
   if(index!==retained.length-1)await expect(preview).toContainText('A newer revision exists.');
   if(index===0){await expect(preview).not.toContainText(laterBody);await page.screenshot({path:`${directory}/old-snapshot.png`,fullPage:true});}
   if(index===retained.length-1){await expect(preview).not.toContainText('first snapshot');await page.screenshot({path:`${directory}/new-snapshot.png`,fullPage:true});}
  }
  // Read storage only with the emitted Worker stopped; every write above used its native session.
  await page.goto('about:blank');
  const [stored]=await state.atRest(`SELECT * FROM page_revisions WHERE page_id='${pageId}' ORDER BY created_at,id`);
  assert.deepEqual(stored.results,retained.map(item=>({id:item.receipt.revisionId,page_id:pageId,author_member_id:'browser-owner',origin:item.origin,content_hash:item.expectedHash,body_json:JSON.stringify(item.snapshot.blocks),properties_json:JSON.stringify(item.snapshot.properties),status_key:null,ordinal:null,label:item.label,created_at:item.receipt.committedAt,deleted_at:null,deleted_by_member_id:null})));
  await writeFile(`${directory}/receipts.json`,JSON.stringify({pageId,width,retained,storedRows:stored.results,reopenedAfterReload:true},null,2)+'\n');
  console.log(`PROBE REV-001 1: native create, title and body edits, workspace publication -> ${retained.length} immutable ordinary-page snapshots; independent hashes and D1 rows agree; reopened after reload at ${width}px`);
 } finally {await profile(workspace.policies);}
}
