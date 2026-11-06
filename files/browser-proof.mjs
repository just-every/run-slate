import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {expect} from '/workspace/run-slate/node_modules/@playwright/test/index.mjs';
import {withWorkspace,accessible} from '/workspace/run-slate/tests/qualification/ui-convergence/browser-support.mjs';
import {ok} from '/workspace/run-slate/tests/qualification/ui-convergence/two-people-support.mjs';
import {beginTouchJourney} from '/workspace/run-slate/tests/qualification/ui-convergence/touch-journey.mjs';
import {tap,type,reachable} from '/workspace/run-slate/tests/qualification/ui-convergence/touch-controls.mjs';
const width=Number(process.argv[2]);
const packet='/home/agent/rer-consolidation/work/sd-slate-c-f180/packet';
await withWorkspace({width,height:width===390?844:1000},'core-wiki',async state=>{
  await ok(state.context,state.origin,'POST','/api/workspace/first-run',{operationKey:crypto.randomUUID(),workspaceName:'Field notes',containerName:'Handbook',pageTitle:'Welcome'});
  const touch=await beginTouchJourney(state,width,{writePage:false});
  try{
    const before={caption:'Response handover',columns:['Task','Owner','Status','Handoff'],rows:[0,1,2].map(i=>({id:crypto.randomUUID(),cells:[`Response ${i+1}`,`Lead ${i+1}`,`Ready ${i+1}`,`Note ${i+1}`]})),widths:[160,160,160,160],merges:[]};
    const {value:{pageId:id}}=await ok(touch.context,touch.origin,'POST','/api/pages',{operationKey:crypto.randomUUID(),containerId:touch.containerId,title:'Touch table handover',blocks:[{id:crypto.randomUUID(),blockType:'table',content:before,treePosition:'a'}]});
    const page=touch.page;
    await page.goto(`${touch.origin}/app/pages/${id}`,{waitUntil:'networkidle'});
    await tap(page.locator('[data-block-id] summary').filter({hasText:'Table tools'}));
    await type(page,page.getByRole('spinbutton',{name:'Merge rows',exact:true}),'2');
    await tap(page.getByRole('button',{name:'Merge cells',exact:true}));
    const input=page.getByRole('textbox',{name:'Row 1, Task',exact:true});
    await type(page,input,'On-call lead confirmed by touch');
    const expected={...before,merges:[{rowId:before.rows[0].id,column:0,rowSpan:2,colSpan:2}],rows:before.rows.map((row,i)=>i===0?{...row,cells:['On-call lead confirmed by touch',...row.cells.slice(1)]}:row)};
    await expect.poll(async()=>(await touch.api(`/api/pages/${id}`)).blocks[0].content).toEqual(expected);
    await page.reload({waitUntil:'networkidle'});
    await reachable(input);
    assert.deepEqual((await touch.api(`/api/pages/${id}`)).blocks[0].content,expected);
    const geometry=await input.evaluate(element=>{
      const box=element.getBoundingClientRect(),scrollport=element.closest('table').parentElement.getBoundingClientRect();
      return {box:box.toJSON(),scrollport:scrollport.toJSON(),fontSize:getComputedStyle(element).fontSize,documentWidth:document.documentElement.scrollWidth,viewport:innerWidth};
    });
    assert.ok(geometry.box.left>=geometry.scrollport.left&&geometry.box.right<=geometry.scrollport.right);
    assert.ok(parseFloat(geometry.fontSize)>=13);
    assert.ok(geometry.documentWidth<=width);
    const icons=await page.getByRole('button').evaluateAll(buttons=>buttons.filter(button=>button.getClientRects().length&&button.textContent.trim()==='').map(button=>({name:button.getAttribute('aria-label'),tooltip:button.getAttribute('data-tooltip')})));
    assert.ok(icons.every(button=>button.name&&button.tooltip),'Visible icon-only controls retain accessible names and tooltips.');
    await accessible(page,`merged table input visible at ${width}`,{fullPage:true});
    await page.screenshot({path:`${packet}/table-${width}.png`,fullPage:true});
    const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
    await writeFile(`${packet}/table-${width}-geometry.json`,JSON.stringify({head,width,geometry,icons,content:expected},null,2));
    console.log(`PROBE NAV-006 table visual ${width}: merged anchor editable, whole input inside scroll viewport, covered cells retained, readable text, named icon tooltips and accessibility passed`);
  }finally{await touch.close();}
});
