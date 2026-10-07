import assert from 'node:assert/strict';
/** Delays an authentic Worker response; no synthesized endpoints or application data. */
export async function resourceChecks({page,context,runtime,id,check}){
 const path=runtime.origin+'/api/pages/'+id;
 const read=async()=>(await context.request.get(path)).json();
 const saveIcon=async icon=>{const doc=await read();const response=await context.request.patch(path,{data:{operationKey:crypto.randomUUID(),expectedRevisionId:doc.page.revisionId,properties:{icon}}});assert.equal(response.status(),200);};
 const oldIcon=(await read()).properties.icon??null;
 await page.goto(runtime.origin+'/app/pages/'+id);await page.getByRole('textbox',{name:'Page title',exact:true}).waitFor();
 await saveIcon('①');
 let count=0,release,ready;const delayed=new Promise(resolve=>{ready=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 await page.route(path,async route=>{count++;if(count!==2)return route.continue();const response=await route.fetch();ready();await gate;await route.fulfill({response}).catch(()=>{});});
 const announce=()=>page.evaluate(pageId=>window.dispatchEvent(new CustomEvent('slate:page-mutated',{detail:{pageId}})),id);
 try{
  await announce();await Promise.race([delayed,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Background reload did not arrive')),10000))]);
  await saveIcon('②');await announce();await page.locator('.page-appearance > .stored-page-icon').filter({hasText:'②'}).waitFor();release();await page.waitForTimeout(250);assert.equal(await page.locator('.page-appearance > .stored-page-icon').textContent(),'②');
  check(['SAVE-003'],'A delayed older real background response cannot overwrite a newer page read; emitted UI remains on latest committed metadata');
 }finally{release();await page.unroute(path);await saveIcon(oldIcon);await announce();}
}
