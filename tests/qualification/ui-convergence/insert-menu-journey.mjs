import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { accessible, openNavigation } from './browser-support.mjs';
import { tap, type, reachable } from './touch-controls.mjs';

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

async function inventory(page) {
  await expect(search(page)).toBeFocused();
  assert.deepEqual(await page.locator('.insert-menu [data-insert-group]').evaluateAll(groups=>groups.map(group=>group.dataset.insertGroup)),['basic','media','advanced']);
  assert.deepEqual(await page.locator('.insert-menu [data-insert-group="basic"] [role="option"]').evaluateAll(rows=>rows.map(row=>row.dataset.insertKind)),basics.map(entry=>entry.kind));
}

/** One populated native page, selected by keyboard at the cursor or by the touch control. */
export async function insertMenuJourney(state,{touch=false}={}) {
  const {page,api,origin}=state;
  const returnTo=page.url();
  const act=touch?tap:locator=>locator.click();
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
      await page.keyboard.press('Home');
      for(let count=0;count<before.length;count++)await page.keyboard.press('ArrowRight');
      if(touch) {
        const add=page.getByRole('button',{name:'＋ Add block',exact:true});
        await expect(source).toBeFocused();await reachable(add);await tap(add);
      } else await page.keyboard.press('/');
      if(index===0) {
        await inventory(page);
        if(!touch) {
          await page.keyboard.type('HeAdInG');
          assert.deepEqual(await page.locator('.insert-menu [role="option"]').evaluateAll(rows=>rows.map(row=>row.dataset.insertKind)),['heading-1','heading-2','heading-3']);
          await page.keyboard.press('ControlOrMeta+a');await page.keyboard.type('synthetic-slate-no-match');
          await expect(page.locator('.insert-menu [role="option"]')).toHaveCount(0);
          await expect(page.locator('.insert-menu')).toContainText('No block matches');
          await page.keyboard.press('Enter');
          await expect(search(page)).toBeFocused();
          assert.equal(plain((await read(api,pageId)).at(-1).content.text),before+after);
          await page.keyboard.press('Escape');
          await expect(source).toBeFocused();
          await expect(source).toHaveText(before+after);
          await page.keyboard.press('/');
          await expect(search(page)).toHaveValue('');
        }
        await accessible(page,touch?'touch basic insert menu':'keyboard basic insert menu',{fullPage:false});
      }
      if(touch) {
        await tap(option(page,entry.kind));
      } else {
        await expect(option(page,'text')).toHaveAttribute('aria-selected','true');
        for(let count=0;count<index;count++)await page.keyboard.press('ArrowDown');
        await expect(option(page,entry.kind)).toHaveAttribute('aria-selected','true');
        await reachable(option(page,entry.kind));
        // Reverse direction too, without using the pointer to repair selection.
        await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowUp');
        await expect(option(page,entry.kind)).toHaveAttribute('aria-selected','true');
        await page.keyboard.press('Enter');
      }
      await expect(search(page)).toHaveCount(0);
      const inserted=touch?page.locator('[data-page-editor] [data-block-id]').last():page.locator('[data-page-editor] [data-block-id]').nth(expected.length+1);
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
      await expect.poll(async()=>{try{assertInserted((await read(api,pageId))[touch?expected.length+1:expected.length+1],entry,marker);return true;}catch{return false;}},{message:`Native committed ${entry.kind}`}).toBe(true);
      const blocks=await read(api,pageId);
      if(touch) {
        assert.equal(blocks[expected.length].id,sourceId);
        assert.equal(plain(blocks[expected.length].content.text),before+after);
        expected.push(blocks[expected.length],blocks[expected.length+1]);
      } else {
        assert.equal(blocks[expected.length].id,sourceId);
        assert.equal(plain(blocks[expected.length].content.text),before);
        assert.equal(plain(blocks[expected.length+2].content.text),after);
        expected.push(...blocks.slice(expected.length,expected.length+3));
      }
      assert.deepEqual(projection(blocks),projection(expected),'Insertion retains preceding blocks and exact native order and content.');
    } catch(cause) {throw new Error(`${touch?'Touch':'Keyboard'} insert ${entry.kind} failed`,{cause});}
  }
  assert.equal(new Set(expected.map(block=>block.id)).size,expected.length,'Every inserted block has a distinct durable identifier.');
  await page.reload({waitUntil:'networkidle'});
  assert.deepEqual(projection(await read(api,pageId)),projection(expected),'Reload retains every selected basic type, position and value.');
  assert.deepEqual(await page.locator('[data-page-editor] [data-block-id]').evaluateAll(rows=>rows.map(row=>row.dataset.blockId)),expected.map(block=>block.id));
  await accessible(page,touch?'touch inserted basic catalog':'keyboard inserted basic catalog',{fullPage:false});
  console.log(`PROBE BLOCK-003 ${touch?'touch inventory and taps':'slash, filters and keyboard cursor insertion'}: fourteen native types and values persist after reload at ${page.viewportSize().width}px`);
  await page.goto(returnTo,{waitUntil:'networkidle'});
}
