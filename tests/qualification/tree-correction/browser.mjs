import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
import {createRuntime} from '../local/runtime.mjs';
import {fixtureFirstOwner} from '../local/first-owner.mjs';
import {actorFixture} from '../interface/actors.mjs';
const checks=[];let runtime,browser,page;
const check=(clauses,name)=>checks.push({clauses,name,passed:true});
try {
 runtime=await createRuntime({root:process.cwd(),evidence:process.env.QUAL_EVIDENCE,appPort:8748,inspectorPort:8749});
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});
 ({page}=await fixtureFirstOwner(runtime,context));
 const read=async(path,ctx=context)=>(await ctx.request.get(runtime.origin+path)).json();
 const id=(await read('/api/pages')).items[0].id;
 const create=async title=>{const result=await context.request.post(runtime.origin+'/api/pages',{data:{operationKey:randomUUID(),containerId:(await read('/api/pages/'+id)).page.containerId,title}});assert.equal(result.status(),200);return (await result.json()).value.pageId;};
 const firstId=await create('Tree first'),sourceId=await create('Tree second'),thirdId=await create('Tree third');
 await runtime.sql(`UPDATE pages SET tree_position=NULL WHERE id='${firstId}'; UPDATE pages SET tree_position='' WHERE id IN ('${sourceId}','${thirdId}');`);
 const reorder=async selector=>{
  await page.goto(runtime.origin+'/app/pages/'+id);await page.waitForLoadState('networkidle');
  await page.getByRole('button',{name:'Move Tree second in tree',exact:true}).click();const move=page.getByRole('dialog');
  await move.getByLabel('Position',{exact:true}).selectOption(selector);await move.getByRole('button',{name:'Review access changes',exact:true}).click();await move.getByRole('button',{name:'Confirm tree move',exact:true}).click();await move.waitFor({state:'hidden'});
  const containerId=(await read('/api/pages/'+id)).page.containerId;const listed=(await read('/api/pages')).items.filter(p=>p.parentPageId===null&&p.containerId===containerId);
  if(selector.startsWith('before:'))assert.equal(listed.findIndex(p=>p.id===sourceId)+1,listed.findIndex(p=>p.id===selector.slice(7)));
  else if(selector.startsWith('after:'))assert.equal(listed.findIndex(p=>p.id===sourceId),listed.findIndex(p=>p.id===selector.slice(6))+1);
  else assert.equal(listed.at(-1).id,sourceId);
 };
 await reorder('before:'+firstId);await reorder('after:'+thirdId);await reorder('');
 check(['TREE-002'],'Native accessible picker confirms before/after/end from NULL and tied empty keys, with persisted API order.');
 await page.goto(runtime.origin+'/app/pages/'+id);await page.waitForLoadState('networkidle');
 const sourceRow=page.locator('.tree-row').filter({has:page.getByRole('link',{name:'Tree second',exact:true})}),targetRow=page.locator('.tree-row').filter({has:page.getByRole('link',{name:'Tree first',exact:true})});
 await targetRow.scrollIntoViewIfNeeded();await sourceRow.scrollIntoViewIfNeeded();
 const targetBox=await targetRow.boundingBox(),sourceBox=await sourceRow.boundingBox();assert.ok(targetBox&&sourceBox);
 await page.mouse.move(sourceBox.x+20,sourceBox.y+sourceBox.height/2);await page.mouse.down();await page.mouse.move(sourceBox.x+30,sourceBox.y+sourceBox.height/2,{steps:5});await page.mouse.move(targetBox.x+100,targetBox.y+targetBox.height/2,{steps:10});await page.mouse.up();
 const drag=page.getByRole('dialog');assert.equal(await drag.getByLabel('Parent page',{exact:true}).inputValue(),firstId);
 await drag.getByRole('button',{name:'Review access changes',exact:true}).click();await drag.getByRole('button',{name:'Confirm tree move',exact:true}).click();await drag.waitFor({state:'hidden'});
 assert.equal((await read('/api/pages/'+sourceId)).parentPageId,firstId);
 check(['TREE-002'],'Actual Chromium mouse drag to row middle reparents through current access review and persists.');
 const original=await read('/api/pages/'+id),viewer=await actorFixture({runtime,browser,id:'tree-correction-reader'});
 try {
 const grant=await context.request.post(runtime.origin+'/api/sharing',{data:{operationKey:randomUUID(),targetKind:'container',targetId:original.page.containerId,principalKind:'member',principalId:viewer.id,level:'view'}});assert.equal(grant.status(),200);
 await viewer.page.setViewportSize({width:1440,height:1000});await viewer.page.goto(runtime.origin+'/app/pages/'+id);
 const title=original.page.title,move=viewer.page.getByRole('button',{name:`Move ${title} in tree`,exact:true});await move.waitFor();assert.equal(await move.isDisabled(),true);
 const row=viewer.page.locator('.tree-row').filter({has:viewer.page.getByRole('link',{name:title,exact:true})});assert.equal(await row.getAttribute('draggable'),'false');
 const denied=await viewer.context.request.post(runtime.origin+`/api/pages/${id}/move-preview`,{data:{containerId:original.page.containerId,atEnd:true}});assert.equal(denied.status(),404);
 await viewer.page.screenshot({path:runtime.directory+'/reader-tree.png',fullPage:true});
 check(['SHARE-002'],'Real view-only session sees disabled Move and non-draggable source row; direct move preview returns 404.');
 }finally{await viewer.context.close();}
 const rows=(await read('/api/pages')).items,first=rows.find(p=>p.title==='Tree first'),third=rows.find(p=>p.title==='Tree third');assert.ok(first&&third);
 await runtime.sql(`UPDATE pages SET tree_position='\uE000' WHERE id='${first.id}'; UPDATE pages SET tree_position='\u{10000}' WHERE id='${third.id}';`);
 await page.goto(runtime.origin+'/app/pages/'+id);await page.getByRole('button',{name:'Move Tree first in tree',exact:true}).waitFor();
 const visible=await page.locator('.tree-row .navlink').evaluateAll(links=>links.map(link=>link.getAttribute('href')?.split('/').at(-1)));
 assert.ok(visible.indexOf(first.id)<visible.indexOf(third.id));
 await page.getByRole('button',{name:`Move ${original.page.title} in tree`,exact:true}).click();
 const dialog=page.getByRole('dialog');const anchors=await dialog.getByLabel('Position',{exact:true}).locator('optgroup').evaluateAll(groups=>groups.map(g=>g.label));assert.ok(anchors.indexOf('Tree first')<anchors.indexOf('Tree third'));
 await dialog.getByLabel('Position',{exact:true}).selectOption('before:'+first.id);await dialog.getByRole('button',{name:'Review access changes',exact:true}).click();await dialog.getByRole('button',{name:'Confirm tree move',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await page.screenshot({path:runtime.directory+'/unicode-picker-result.png',fullPage:true});
 check(['TREE-002'],'Real navigation and native accessible picker order U+E000 before U+10000; reviewed picker placement commits.');
 await writeFile(runtime.directory+'/tree-correction.json',JSON.stringify({checks,artifact:runtime.artifact,limits:'Local emitted Worker; labelled local identity fixtures only; no provider/deployment claim.'},null,2));console.log(runtime.directory);
}catch(error){if(runtime){await writeFile(runtime.directory+'/failure.json',JSON.stringify({checks,error:error.stack},null,2));await page?.screenshot({path:runtime.directory+'/failure.png',fullPage:true}).catch(()=>{});console.error(runtime.directory);}throw error;}
finally{await browser?.close();await runtime?.close();}
