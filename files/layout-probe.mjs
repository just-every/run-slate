import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {expect} from '/workspace/run-slate/node_modules/@playwright/test/index.mjs';
import {withWorkspace,setupWorkspace} from '/workspace/run-slate/tests/qualification/ui-convergence/browser-support.mjs';
import {ok} from '/workspace/run-slate/tests/qualification/ui-convergence/two-people-support.mjs';
const mode=process.argv[2];
await withWorkspace({width:390,height:844},'core-wiki',async state=>{
  await setupWorkspace(state);
  const {page,context,origin}=state,spaces=await state.api('/api/containers');
  const containerId=spaces.items.find(item=>item.name==='Handbook').id;
  const created=await ok(context,origin,'POST','/api/pages',{operationKey:randomUUID(),containerId,title:'Escalation guide escalationprobe123456',blocks:[{id:randomUUID(),blockType:'paragraph',treePosition:'a',content:{text:[{text:'Please confirm escalationprobe123456.'}]}}]});
  const pageId=created.value.pageId;
  let held;
  const matches=url=>url.pathname==='/api/decisions'&&url.searchParams.get('pageId')===pageId;
  await page.route(matches,route=>{held=route;});
  try {
    await page.goto(`${origin}/app/pages/${pageId}?highlight=escalationprobe123456`,{waitUntil:'domcontentloaded'});
    await expect(page.locator('[data-page-editor]')).toBeVisible();
    await expect.poll(()=>!!held).toBe(true);
    await expect.poll(()=>page.evaluate(()=>CSS.highlights.get('search-match')?.size??0)).toBeGreaterThan(0);
    const pending=await page.locator('[data-page-editor]').boundingBox();
    const loading=await page.locator('.page-document .request-loading').count();
    const threshold=page.viewportSize().height*.45;
    await held.continue();held=undefined;
    await page.waitForLoadState('networkidle');
    const after=await page.locator('[data-page-editor]').boundingBox();
    const value={mode,pageId,pendingBodyY:pending.y,afterBodyY:after.y,threshold,loadingIndicators:loading,pendingCompact:pending.y<threshold,afterCompact:after.y<threshold};
    console.log(JSON.stringify(value));
    if(mode==='before'){assert.equal(value.pendingCompact,false);assert.equal(value.afterCompact,true);assert.ok(loading>0);}
    else {assert.equal(value.pendingCompact,true);assert.equal(value.afterCompact,true);assert.equal(loading,0);assert.equal(pending.y,after.y);}
    await writeFile(`/home/agent/rer-consolidation/work/sd-slate-c-f205/packet/layout-${mode}.json`,JSON.stringify(value,null,2)+'\n');
  } finally {await held?.abort().catch(()=>{});await page.unroute(matches);}
});
