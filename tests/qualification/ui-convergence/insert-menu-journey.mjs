import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { accessible, openNavigation } from './browser-support.mjs';
import { tap, type } from './touch-controls.mjs';

// The writer's selected basic inventory, independent of the implementation catalog.
const basics = [
  {kind:'text',type:'paragraph'},
  ...[1,2,3].map(level=>({kind:`heading-${level}`,type:'heading',level})),
  ...['bulleted','numbered','toggle'].map(variant=>({kind:`${variant}-list`,type:'list',variant})),
  {kind:'task',type:'task'}, {kind:'quote',type:'quote'}, {kind:'divider',type:'divider'},
  {kind:'callout',type:'callout'}, {kind:'expandable',type:'expandable'},
  {kind:'table',type:'table'}, {kind:'code',type:'code'},
];
const plain=spans=>(spans??[]).map(span=>span.text).join('');
const option=(page,kind)=>page.locator(`.insert-menu [data-insert-kind="${kind}"]`);
const search=page=>page.getByRole('combobox',{name:'Insert a block',exact:true});
const read=(api,id)=>api(`/api/pages/${id}`).then(value=>value.blocks);
const projection=blocks=>blocks.map(({id,blockType,parentBlockId,treePosition,content})=>({id,blockType,parentBlockId,treePosition,content}));

function assertInserted(block,entry,marker) {
  assert.equal(block.blockType,entry.type,entry.kind);
  assert.equal(block.parentBlockId,null);
  const content=block.content;
  if(entry.level)assert.equal(content.level,entry.level);
  if(entry.variant){assert.equal(content.variant,entry.variant);assert.equal(content.items.length,1);assert.equal(plain(content.items[0].text),marker);}
  else if(entry.type==='divider')assert.deepEqual(content,{});
  else if(entry.type==='expandable'){assert.equal(content.summary,marker);assert.equal(content.open,true);assert.equal(plain(content.content),`${marker} detail`);}
  else if(entry.type==='table'){assert.deepEqual(content.columns,[marker,'']);assert.equal(content.rows.length,1);assert.deepEqual(content.rows[0].cells,[`${marker} cell`,'']);}
  else if(entry.type==='code'){assert.equal(content.language,'text');assert.equal(content.code,marker);}
  else {assert.equal(plain(content.text),marker);if(entry.type==='task')assert.equal(content.done,false);if(entry.type==='callout')assert.equal(content.tone,'neutral');}
}

async function visibleWithoutScrolling(locator) {
  await expect.poll(()=>locator.evaluate(element=>{
    const r=element.getBoundingClientRect(),v=window.visualViewport;
    const left=v?.offsetLeft??0,top=v?.offsetTop??0;
    const list=element.closest('[role="listbox"]')?.getBoundingClientRect();
    const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return r.width>0&&r.height>0&&r.left>=left&&r.top>=top
      &&r.right<=left+(v?.width??innerWidth)&&r.bottom<=top+(v?.height??innerHeight)
      &&(!list||(r.top>=list.top&&r.bottom<=list.bottom))
      &&(hit===element||element.contains(hit));
  }),{message:'Keyboard selection stays wholly visible without a test scrolling or focusing it.'}).toBe(true);
}

async function inventory(page) {
  await expect(search(page)).toBeFocused();
  await visibleWithoutScrolling(search(page));
  await visibleWithoutScrolling(page.locator('.insert-menu').getByRole('button',{name:'Close menu',exact:false}));
  assert.deepEqual(await page.locator('.insert-menu [data-insert-group]').evaluateAll(groups=>groups.map(group=>group.dataset.insertGroup)),['basic','media','advanced']);
  assert.deepEqual(await page.locator('.insert-menu [data-insert-group="basic"] [role="option"]').evaluateAll(rows=>rows.map(row=>row.dataset.insertKind)),basics.map(entry=>entry.kind));
}

/** One populated native page, selected by keyboard at the cursor or by the touch control. */
export async function insertMenuJourney(state,options={}) {
  if(!options.touch)return runInsertMenuJourney(state,options);
  // Resizing this probe must not change the original writing tab's viewport or history.
  const originalPages=(await state.api('/api/pages')).items.map(item=>item.id).sort();
  const page=await state.page.context().newPage(),errors=[];
  page.on('pageerror',cause=>errors.push(String(cause)));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  try {
    await page.goto(state.origin+'/app',{waitUntil:'networkidle'});
    const pageId=await runInsertMenuJourney({...state,page},options);
    // Retire this probe's own page after durable readback, preserving the writing fixture.
    const document=await state.api(`/api/pages/${pageId}`);
    const retired=await page.context().request.post(`${state.origin}/api/archive/${pageId}`,{
      headers:{origin:state.origin},data:{operationKey:crypto.randomUUID(),expectedRevisionId:document.page.revisionId,action:'trash'},
    });
    assert.equal(retired.status(),200,await retired.text());
    assert.deepEqual((await state.api('/api/pages')).items.map(item=>item.id).sort(),originalPages,'The proof leaves the original visible page inventory unchanged.');
    assert.deepEqual(errors,[],'The native touch insert page has no browser errors.');
  } finally {await page.close();}
}

async function runInsertMenuJourney(state,{touch=false}={}) {
  const {page,api,origin}=state;
  const returnTo=page.url();
  const viewport=page.viewportSize();
  // A reduced visual viewport exercises menu scrolling while the touch editor is focused.
  if(touch)await page.setViewportSize({...viewport,height:520});
  const act=touch?async locator=>{
    // Center before tapping; browser edge intersection can round a fraction of a pixel.
    await locator.evaluate(element=>element.scrollIntoView({block:'center',inline:'nearest'}));
    await tap(locator);
  }:locator=>locator.click();
  await openNavigation(page);
  await act(page.getByRole('button',{name:'Create',exact:true}));
  await act(page.getByRole('menuitem',{name:'Page',exact:true}));
  await page.waitForURL(url=>url.pathname.startsWith('/app/pages/')&&url.href!==returnTo,{waitUntil:'networkidle'});
  const pageId=new URL(page.url()).pathname.split('/').at(-1);
  const title=page.getByRole('textbox',{name:'Page title',exact:true});
  await title.fill(touch?'Touch insert examples':'Keyboard insert examples');await title.press('Tab');
  const expected=[];
  for(const [index,entry] of basics.entries()) {
    try {
      let source;
      if(index===0)source=page.getByRole('textbox',{name:'Page body',exact:true});
      else {
        // With no body caret, Add block still appends a fresh source paragraph.
        await act(title);
        await act(page.getByRole('button',{name:'＋ Add block',exact:true}));
        await act(option(page,'text'));
        source=page.getByRole('textbox',{name:'Paragraph',exact:true}).last();
      }
      const before=`synthetic-slate-left-${index} `,after=`synthetic-slate-right-${index}`;
      if(touch)await type(page,source,before+after);
      else {await source.click();await page.keyboard.type(before+after);}
      await expect.poll(async()=>plain((await read(api,pageId)).at(-1)?.content.text)).toBe(before+after);
      const sourceId=(await read(api,pageId)).at(-1).id;
      source=page.locator(`[data-block-id="${sourceId}"] [data-slate-editable]`);
      // Actual key presses establish the cursor; no DOM selection or focus injection.
      await page.keyboard.press('ControlOrMeta+Home');
      for(let count=0;count<before.length;count++)await page.keyboard.press('ArrowRight');
      if(touch) {
        const add=page.getByRole('button',{name:'＋ Add block',exact:true});
        await expect(source).toBeFocused();await act(add);
      } else await page.keyboard.press('/');
      if(index===0) {
        await inventory(page);
        {
          const query=async value=>{
            if(touch)await type(page,search(page),value);
            else {await page.keyboard.press('ControlOrMeta+a');await page.keyboard.type(value);}
          };
          await query('HeAdInG');
          assert.deepEqual(await page.locator('.insert-menu [role="option"]').evaluateAll(rows=>rows.map(row=>row.dataset.insertKind)),['heading-1','heading-2','heading-3','table-of-contents']);
          await query('horizontal');
          await expect(option(page,'divider')).toHaveCount(1);
          await expect(page.locator('.insert-menu [role="option"]')).toHaveCount(1);
          await query('##');
          assert.deepEqual(await page.locator('.insert-menu [role="option"]').evaluateAll(rows=>rows.map(row=>row.dataset.insertKind)),['heading-2','heading-3']);
          await query('synthetic-slate-no-match');
          await expect(page.locator('.insert-menu [role="option"]')).toHaveCount(0);
          await expect(page.locator('.insert-menu')).toContainText('No block matches');
          await page.keyboard.press('Enter');
          await expect(search(page)).toBeFocused();
          assert.equal(plain((await read(api,pageId)).at(-1).content.text),before+after);
          if(touch)await act(page.locator('.insert-menu').getByRole('button',{name:'Close menu',exact:false}));
          else await page.keyboard.press('Escape');
          await expect(source).toBeFocused();
          await expect(source).toHaveText(before+after);
          if(touch)await act(page.getByRole('button',{name:'＋ Add block',exact:true}));
          else await page.keyboard.press('/');
          await expect(search(page)).toHaveValue('');
        }
        await accessible(page,touch?'touch basic insert menu':'keyboard basic insert menu',{fullPage:false});
      }
      if(touch) {
        await act(option(page,entry.kind));
      } else {
        await expect(option(page,'text')).toHaveAttribute('aria-selected','true');
        for(let count=0;count<index;count++)await page.keyboard.press('ArrowDown');
        await expect(option(page,entry.kind)).toHaveAttribute('aria-selected','true');
        await visibleWithoutScrolling(option(page,entry.kind));
        // Reverse direction too, without using the pointer to repair selection.
        await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowUp');
        await expect(option(page,entry.kind)).toHaveAttribute('aria-selected','true');
        await page.keyboard.press('Enter');
      }
      await expect(search(page)).toHaveCount(0);
      const inserted=page.locator('[data-page-editor] [data-block-id]').nth(expected.length+1);
      const marker=`synthetic-slate-${touch?'touch':'keyboard'}-${index}`;
      if(entry.type==='divider')await expect(page.locator('[data-page-editor]')).toBeFocused();
      else {
        await expect(inserted.locator('[contenteditable="true"]').first()).toBeFocused();
        await page.keyboard.type(marker);
        if(entry.type==='expandable') {
          await act(inserted.getByRole('textbox',{name:'Expandable section content',exact:true}));await page.keyboard.type(`${marker} detail`);
        }
        if(entry.type==='table') {
          await act(inserted.getByRole('textbox',{name:`Row 1, ${marker}`,exact:true}));await page.keyboard.type(`${marker} cell`);
        }
      }
      await expect.poll(async()=>{try{assertInserted((await read(api,pageId))[expected.length+1],entry,marker);return true;}catch{return false;}},{message:`Native committed ${entry.kind}`}).toBe(true);
      const blocks=await read(api,pageId);
      assert.equal(blocks[expected.length].id,sourceId);
      assert.equal(plain(blocks[expected.length].content.text),before,'The source keeps the text before the insertion cursor.');
      assert.equal(plain(blocks[expected.length+2].content.text),after,'The following paragraph keeps the text after the insertion cursor.');
      expected.push(...blocks.slice(expected.length,expected.length+3));
      assert.deepEqual(projection(blocks),projection(expected),'Insertion retains preceding blocks and exact native order and content.');
    } catch(cause) {throw new Error(`${touch?'Touch':'Keyboard'} insert ${entry.kind} failed`,{cause});}
  }
  // Revisit an earlier paragraph: the focused control must not append after
  // all the blocks just written, or replace any of those later blocks.
  const first=expected[0],firstText=plain(first.content.text),offset=firstText.indexOf('left');
  const source=page.locator(`[data-block-id="${first.id}"] [data-slate-editable]`);
  await act(source);
  await page.keyboard.press('ControlOrMeta+Home');
  for(let count=0;count<offset;count++)await page.keyboard.press('ArrowRight');
  if(touch)await act(page.getByRole('button',{name:'＋ Add block',exact:true}));
  else await page.keyboard.press('/');
  if(touch)await act(option(page,'text'));
  else await page.keyboard.press('Enter');
  const middle=page.locator('[data-page-editor] [data-block-id]').nth(1).getByRole('textbox',{name:'Paragraph',exact:true});
  await expect(middle).toBeFocused();
  await page.keyboard.type('synthetic-slate-middle');
  await expect.poll(async()=>plain((await read(api,pageId))[1]?.content.text)).toBe('synthetic-slate-middle');
  const blocks=await read(api,pageId);
  assert.equal(blocks[0].id,first.id);
  assert.equal(plain(blocks[0].content.text),firstText.slice(0,offset));
  assertInserted(blocks[1],basics[0],'synthetic-slate-middle');
  assert.equal(blocks[2].blockType,'paragraph');
  assert.equal(plain(blocks[2].content.text),firstText.slice(offset));
  const retained=items=>projection(items).map(({treePosition,...block})=>block);
  assert.deepEqual(retained(blocks.slice(3)),retained(expected.slice(1)),'Inserting into an earlier paragraph preserves every following block in order.');
  expected.splice(0,expected.length,...blocks);
  assert.equal(new Set(expected.map(block=>block.id)).size,expected.length,'Every inserted block has a distinct durable identifier.');
  await page.reload({waitUntil:'networkidle'});
  assert.deepEqual(projection(await read(api,pageId)),projection(expected),'Reload retains every selected basic type, position and value.');
  assert.deepEqual(await page.locator('[data-page-editor] [data-block-id]').evaluateAll(rows=>rows.map(row=>row.dataset.blockId)),expected.map(block=>block.id));
  if(touch)await page.setViewportSize(viewport);
  await accessible(page,touch?'touch inserted basic catalog':'keyboard inserted basic catalog',{fullPage:false});
  console.log(`PROBE BLOCK-003 ${touch?'touch inventory and taps':'slash, filters and keyboard cursor insertion'}: fourteen native types and values persist after reload at ${page.viewportSize().width}px`);
  await page.goto(returnTo,{waitUntil:'networkidle'});
  return pageId;
}
