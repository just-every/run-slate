import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {ok} from './two-people-support.mjs';
import {accessible} from './browser-evidence.mjs';
import {tap,type,checkpoint} from './touch-controls.mjs';

async function touchIntoColumn(page,handle,target){
 await handle.scrollIntoViewIfNeeded();await target.scrollIntoViewIfNeeded();
 const from=await handle.boundingBox(),to=await target.boundingBox();
 assert.ok(from&&to);
 const cdp=await page.context().newCDPSession(page);
 try{
  const start={x:from.x+from.width/2,y:from.y+from.height/2},end={x:to.x+to.width/2,y:to.y+to.height/2};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
  for(let step=1;step<=8;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*step/8,y:start.y+(end.y-start.y)*step/8}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }finally{await cdp.detach();}
}

export async function columnsJourney(state,width,touch){
 const {page,context,origin,api}=state;
 const container=(await api('/api/containers')).items.find(item=>item.name==='Handbook');
 const words=['Plan the response','Assign the response lead','Confirm completion'];
 const ids=words.map(()=>randomUUID());
 const {value:{pageId}}=await ok(context,origin,'POST','/api/pages',{operationKey:randomUUID(),containerId:container.id,title:'Incident response layout',blocks:words.map((text,index)=>({id:ids[index],blockType:'paragraph',content:{text:[{text}]},treePosition:String(index)}))});
 await page.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});
 await page.getByRole('button',{name:/Add block/}).click();
 await page.getByRole('option',{name:'Columns',exact:true}).click();
 await expect(page.getByRole('group',{name:/^Column \d$/})).toHaveCount(3);
 await expect.poll(async()=>(await api(`/api/pages/${pageId}`)).blocks.filter(b=>b.blockType==='column').length).toBe(3);
 for(let index=0;index<3;index++){
  const target=page.locator('.slate-column').nth(index);
  await page.locator(`[data-block-id="${ids[index]}"]`).getByRole('button',{name:`Block actions for ${words[index]}`,exact:true}).dragTo(target);
  await expect.poll(async()=>{const document=await api(`/api/pages/${pageId}`);return document.blocks.find(b=>b.id===ids[index]).parentBlockId;}).toBe(await target.getAttribute('data-column-id'));
 }
 const bounds=await page.locator('.slate-column').evaluateAll(elements=>elements.map(element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right};}));
 if(width===1440){assert.ok(bounds[0].x<bounds[1].x&&bounds[1].x<bounds[2].x);assert.equal(bounds[0].y,bounds[2].y);}
 else {assert.equal(bounds[0].x,bounds[2].x);assert.ok(bounds[0].y<bounds[1].y&&bounds[1].y<bounds[2].y);}
 await accessible(page,'columns desktop layout');
 await page.screenshot({path:`.artifacts/ui-convergence/columns-${width}-populated.png`,fullPage:true});
 await page.reload({waitUntil:'networkidle'});
 for(let index=0;index<3;index++)await expect(page.locator('.slate-column').nth(index)).toContainText(words[index]);
 // Separate member context drives the insertion and drag without hover, including at phone width.
 const targetPage=touch.page,id=touch.pageId;
 await targetPage.goto(`${origin}/app/pages/${id}`,{waitUntil:'networkidle'});
 await tap(targetPage.getByRole('button',{name:/Add block/}));
 await tap(targetPage.getByRole('option',{name:'Columns',exact:true}));
 await expect.poll(async()=>(await touch.api(`/api/pages/${id}`)).blocks.filter(b=>b.blockType==='column').length).toBe(3);
 await tap(targetPage.getByRole('combobox',{name:'Number of columns',exact:true}));
 await targetPage.getByRole('combobox',{name:'Number of columns',exact:true}).selectOption('2');
 await expect(targetPage.locator('.slate-column')).toHaveCount(2);
 await expect.poll(async()=>(await touch.api(`/api/pages/${id}`)).blocks.find(b=>b.blockType==='columns').content.count).toBe(2);
 await tap(targetPage.getByRole('combobox',{name:'Number of columns',exact:true}));
 await targetPage.getByRole('combobox',{name:'Number of columns',exact:true}).selectOption('3');
 await expect(targetPage.locator('.slate-column')).toHaveCount(3);
 await expect.poll(async()=>(await touch.api(`/api/pages/${id}`)).blocks.find(b=>b.blockType==='columns').content.count).toBe(3);
 const document=await touch.api(`/api/pages/${id}`),source=document.blocks.find(b=>b.blockType==='paragraph'&&JSON.stringify(b.content).includes('Confirm the response owner.'));
 const handle=targetPage.locator(`[data-block-id="${source.id}"]`).getByRole('button',{name:/Block actions for/});
 await touchIntoColumn(targetPage,handle,targetPage.locator('.slate-column').first());
 await expect.poll(async()=>(await touch.api(`/api/pages/${id}`)).blocks.find(b=>b.id===source.id).parentBlockId).toBe(await targetPage.locator('.slate-column').first().getAttribute('data-column-id'));
 const input=targetPage.locator('.slate-column').first().getByRole('textbox',{name:'Paragraph',exact:true});
 await expect(input).toBeEditable();
 await type(targetPage,input,'Response owner confirmed by touch.');
 await expect.poll(async()=>JSON.stringify((await touch.api(`/api/pages/${id}`)).blocks)).toContain('Response owner confirmed by touch.');
 const outside=document.blocks.find(b=>b.blockType==='paragraph'&&b.id!==source.id);
 await touchIntoColumn(targetPage,handle,targetPage.locator(`[data-block-id="${outside.id}"]`));
 await expect.poll(async()=>(await touch.api(`/api/pages/${id}`)).blocks.find(b=>b.id===source.id).parentBlockId).toBe(null);
 await touchIntoColumn(targetPage,handle,targetPage.locator('.slate-column').first());
 await expect.poll(async()=>(await touch.api(`/api/pages/${id}`)).blocks.find(b=>b.id===source.id).parentBlockId).toBe(await targetPage.locator('.slate-column').first().getAttribute('data-column-id'));

 await checkpoint(targetPage,'columns insert drag and edit');
 await targetPage.screenshot({path:`.artifacts/ui-convergence/columns-${width}-touch.png`,fullPage:true});
 console.log(`BLOCK-012 columns insert, desktop drag and touch layout passed at ${width}px`);
}
