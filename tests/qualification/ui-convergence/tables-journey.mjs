import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {ok} from './two-people-support.mjs';
import {writeFile} from 'node:fs/promises';
import {tap,type,reachable,checkpoint} from './touch-controls.mjs';

/** Native member edits use labeled touch controls, including cells offscreen to the right. */
export async function touchTablesJourney({page,context,origin,api,containerId}) {
  const blockId=randomUUID(),rowIds=Array.from({length:3},()=>randomUUID());
  let expected={caption:'Response handover',columns:['Task','Owner','Status','Handoff'],
    rows:rowIds.map((id,index)=>({id,cells:[`Response ${index+1}`,`Lead ${index+1}`,`Ready ${index+1}`,`Note ${index+1}`]})),
    headerColumn:true,widths:[160,160,160,160],colours:{[`${rowIds[1]}:2`]:'green'},merges:[]};
  assert.equal((await api('/api/members/current')).role,'member');
  const {value:{pageId}}=await ok(context,origin,'POST','/api/pages',{operationKey:randomUUID(),containerId,
    title:'Touch table handover',blocks:[{id:blockId,blockType:'table',content:expected,treePosition:'a'}]});
  const route=`/api/pages/${pageId}`,block=page.locator(`[data-block-id="${blockId}"]`),receipts=[];
  const content=async()=>{
    const document=await api(route);
    assert.equal(document.blocks.length,1,'Table operations preserve the page block inventory.');
    assert.equal(document.blocks[0].id,blockId);
    return document.blocks[0].content;
  };
  const tools=async()=>{
    const details=block.locator('details');
    if(!await details.evaluate(element=>element.open))await tap(details.locator('summary'));
  };
  const select=async(label,value)=>{
    const control=block.getByRole('combobox',{name:label,exact:true});
    await tap(control);await control.selectOption(String(value));
  };
  const reconcile=async operation=>{
    await expect.poll(content,{message:`${operation}: complete native content is committed`}).toEqual(expected);
    await expect(page.getByRole('status').filter({hasText:/^Saved/}).first()).toBeVisible();
    await page.reload({waitUntil:'networkidle'});
    assert.deepEqual(await content(),expected,`${operation}: native reload retains every cell and table setting`);
    for(let column=0;column<expected.columns.length;column++){
      await expect(block.getByRole('textbox',{name:`Column ${column+1} heading`,exact:true})).toHaveText(expected.columns[column]);
    }
    for(let row=0;row<expected.rows.length;row++)for(let column=0;column<expected.columns.length;column++){
      const merge=expected.merges.find(m=>{
        const start=expected.rows.findIndex(r=>r.id===m.rowId);
        return row>=start&&row<start+m.rowSpan&&column>=m.column&&column<m.column+m.colSpan;
      });
      const cell=block.locator(`tbody [data-table-row="${row}"][data-table-column="${column}"]`);
      if(merge&&(expected.rows[row].id!==merge.rowId||column!==merge.column))await expect(cell).toHaveCount(0);
      else {
        await expect(cell.getByRole('textbox')).toHaveText(expected.rows[row].cells[column]);
        if(merge){
          await expect(cell).toHaveAttribute('rowspan',String(merge.rowSpan));
          await expect(cell).toHaveAttribute('colspan',String(merge.colSpan));
          const start=expected.rows.findIndex(r=>r.id===merge.rowId);
          for(let r=start;r<start+merge.rowSpan;r++)for(let c=merge.column;c<merge.column+merge.colSpan;c++)
            await expect(cell).toContainText(expected.rows[r].cells[c]);
        }
      }
    }
    receipts.push({operation,content:await content()});
    console.log(`PROBE NAV-006 table ${operation}: member touch controls -> saved, reloaded and native content reconciled`);
  };
  await page.goto(origin+route.replace('/api/','/app/'),{waitUntil:'networkidle'});
  await reconcile('populated native creation');
  // Scroll a real wide table to the last column rather than shrinking the fixture to fit.
  await type(page,block.getByRole('textbox',{name:'Column 4 heading',exact:true}),'Next handover');
  expected={...expected,columns:['Task','Owner','Status','Next handover']};
  await reconcile('heading edit');
  await type(page,block.getByRole('textbox',{name:'Row 3, Next handover',exact:true}),'Dispatch confirmed');
  expected={...expected,rows:expected.rows.map((row,i)=>i===2?{...row,cells:[...row.cells.slice(0,3),'Dispatch confirmed']}:row)};
  await reconcile('cell edit');

  await tools();await select('Table row',0);await tap(block.getByRole('button',{name:'Add row',exact:true}));
  // Only the new row identity is generated; position, empty cells and all retained data are independently expected.
  await expect.poll(async()=> (await content()).rows.map(row=>row.cells)).toEqual([
    expected.rows[0].cells,['','','',''],...expected.rows.slice(1).map(row=>row.cells),
  ]);
  const addedRow=(await content()).rows[1];
  assert.ok(addedRow.id&&!rowIds.includes(addedRow.id),'Adding a row allocates a new identity.');
  expected={...expected,rows:[expected.rows[0],{id:addedRow.id,cells:['','','','']},...expected.rows.slice(1)]};
  await reconcile('add row');
  await type(page,block.getByRole('textbox',{name:'Row 2, Task',exact:true}),'Temporary response');
  expected={...expected,rows:expected.rows.map((row,i)=>i===1?{...row,cells:['Temporary response','','','']}:row)};
  await reconcile('edit added row');
  await tools();await select('Table row',1);await tap(block.getByRole('button',{name:'Remove row',exact:true}));
  expected={...expected,rows:expected.rows.filter(row=>row.id!==addedRow.id)};
  await reconcile('remove selected row');

  await tools();await select('Table column',1);await tap(block.getByRole('button',{name:'Add column',exact:true}));
  expected={...expected,columns:['Task','Owner','','Status','Next handover'],widths:[160,160,180,160,160],
    rows:expected.rows.map(row=>({...row,cells:[...row.cells.slice(0,2),'',...row.cells.slice(2)]})),colours:{[`${rowIds[1]}:3`]:'green'}};
  await reconcile('add column');
  await type(page,block.getByRole('textbox',{name:'Column 3 heading',exact:true}),'Temporary checkpoint');
  expected={...expected,columns:['Task','Owner','Temporary checkpoint','Status','Next handover']};
  await reconcile('edit added heading');
  await type(page,block.getByRole('textbox',{name:'Row 2, Temporary checkpoint',exact:true}),'Temporary coverage');
  expected={...expected,rows:expected.rows.map((row,i)=>i===1?{...row,cells:[...row.cells.slice(0,2),'Temporary coverage',...row.cells.slice(3)]}:row)};
  await reconcile('edit added column');
  await tools();await select('Table column',2);await tap(block.getByRole('button',{name:'Remove column',exact:true}));
  expected={...expected,columns:['Task','Owner','Status','Next handover'],widths:[160,160,160,160],
    rows:expected.rows.map(row=>({...row,cells:row.cells.filter((_,i)=>i!==2)})),colours:{[`${rowIds[1]}:2`]:'green'}};
  await reconcile('remove selected column');

  await tools();await select('Table row',0);await select('Table column',0);
  for(const label of ['Merge rows','Merge columns'])await type(page,block.getByRole('spinbutton',{name:label,exact:true}),'2');
  await tap(block.getByRole('button',{name:'Merge cells',exact:true}));
  expected={...expected,merges:[{rowId:rowIds[0],column:0,rowSpan:2,colSpan:2}]};
  await reconcile('merge populated rectangle');
  await tools();await reachable(block.getByRole('button',{name:'Unmerge cells',exact:true}));
  await checkpoint(page,'table merged with covered content');
  await type(page,block.getByRole('textbox',{name:'Row 1, Task',exact:true}),'Response lead confirmed');
  expected={...expected,rows:expected.rows.map((row,i)=>i===0?{...row,cells:['Response lead confirmed',...row.cells.slice(1)]}:row)};
  await reconcile('edit merged anchor');
  await tools();await tap(block.getByRole('button',{name:'Unmerge cells',exact:true}));
  expected={...expected,merges:[]};
  await reconcile('unmerge retains covered cells');
  // Previously concealed content is editable again and survives its own save.
  await type(page,block.getByRole('textbox',{name:'Row 2, Owner',exact:true}),'Relief lead confirmed');
  expected={...expected,rows:expected.rows.map((row,i)=>i===1?{...row,cells:[row.cells[0],'Relief lead confirmed',...row.cells.slice(2)]}:row)};
  await reconcile('edit uncovered cell');
  await tools();
  for(const name of ['Add row','Remove row','Add column','Remove column','Merge cells'])
    await reachable(block.getByRole('button',{name,exact:true}));
  await checkpoint(page,'table editing and structure controls');
  await writeFile(`.artifacts/ui-convergence/touch-tables-${page.viewportSize().width}.json`,JSON.stringify({pageId,blockId,receipts},null,2));
  return pageId;
}

export async function tablesJourney({page,context,origin,api}) {
  const space=(await api('/api/containers')).items.find(s=>s.name==='Handbook'),blockId=randomUUID();
  const {value:{pageId}}=await ok(context,origin,'POST','/api/pages',{operationKey:randomUUID(),containerId:space.id,title:'Launch readiness',blocks:[{id:blockId,blockType:'table',content:{caption:'Release handover',columns:['',''],rows:[{id:randomUUID(),cells:['','']}]},treePosition:'a'}]});
  await page.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});
  const block=page.locator(`[data-block-id="${blockId}"]`);
  const cells=[['Workstream','Owner',...Array.from({length:18},(_,i)=>`Checkpoint ${i+1}`)],...Array.from({length:9},(_,r)=>[`Workstream ${r+1}`,r%2?'Morgan':'Alex',...Array.from({length:18},(_,c)=>`Ready ${r+1}.${c+1}`)])];
  cells[1][2]='Approval "ready"\nHold until Monday';
  const quote=value=>/["\t\r\n]/.test(value)?'"'+value.replaceAll('"','""')+'"':value;
  await page.evaluate(text=>navigator.clipboard.writeText(text),cells.map(row=>row.map(quote).join('\t')).join('\r\n'));
  await block.getByRole('textbox',{name:'Column 1 heading',exact:true}).click();
  await page.keyboard.press('ControlOrMeta+V');
  await expect(block.locator('thead th')).toHaveCount(20);
  await expect(block.locator('tbody tr')).toHaveCount(9);
  await expect.poll(async()=> (await api(`/api/pages/${pageId}`)).blocks[0].content.rows.map(row=>row.cells)).toEqual(cells.slice(1));
  await block.locator('summary').filter({hasText:'Table tools'}).click();
  await block.getByLabel('Cell colour',{exact:true}).selectOption('green');
  await block.getByLabel('Column width',{exact:true}).fill('240');
  await block.getByLabel('Header column',{exact:true}).check();
  await block.getByRole('button',{name:'Merge cells',exact:true}).click();
  await expect(block.locator('tbody tr').first().locator('[colspan="2"]')).toHaveCount(1);
  await block.getByLabel('Table column',{exact:true}).selectOption('19');
  await block.getByRole('button',{name:'Sort descending',exact:true}).click();
  await expect.poll(async()=>{const d=await api(`/api/pages/${pageId}`);return d.blocks[0].content.rows[0].cells[0];}).toBe('Workstream 9');
  const before=(await api(`/api/pages/${pageId}`)).blocks[0].content;
  assert.equal(before.rows.length,9);assert.equal(before.columns.length,20);
  // All four structure actions also work from the keyboard and preserve cell data.
  const last=block.getByRole('textbox',{name:'Row 1, Workstream',exact:true});
  await last.click();await page.keyboard.press('Alt+Shift+ArrowDown');
  await expect(block.locator('tbody tr')).toHaveCount(10);
  await page.keyboard.press('Alt+Shift+ArrowDown');
  await expect(block.locator('tbody tr')).toHaveCount(11);
  for(let i=0;i<2;i++){await block.getByRole('textbox',{name:'Row 2, Workstream',exact:true}).click();await page.keyboard.press('Alt+Shift+ArrowUp');}
  await expect(block.locator('tbody tr')).toHaveCount(9);
  await block.getByRole('textbox',{name:'Row 1, Workstream',exact:true}).click();
  await page.keyboard.press('Alt+Shift+ArrowRight');
  await expect(block.locator('thead th')).toHaveCount(21);
  await block.getByRole('textbox',{name:'Row 1, column 2',exact:true}).click();
  await page.keyboard.press('Alt+Shift+ArrowLeft');
  await expect(block.locator('thead th')).toHaveCount(20);
  // Reapply the merge after structure editing, retaining every underlying cell.
  await block.getByLabel('Table row',{exact:true}).selectOption('0');
  await block.getByLabel('Table column',{exact:true}).selectOption('0');
  await block.getByRole('button',{name:'Merge cells',exact:true}).click();
  await expect.poll(async()=> (await api(`/api/pages/${pageId}`)).blocks[0].content.merges?.[0]?.rowId).toBe(before.rows[0].id);
  const committed=(await api(`/api/pages/${pageId}`)).blocks[0].content;
  await page.screenshot({path:`.artifacts/ui-convergence/tables-${page.viewportSize().width}-editing.png`});
  await block.getByRole('button',{name:'Convert to database',exact:true}).click();
  await expect(page).toHaveURL(/\/app\/databases\//);
  await expect(page.getByRole('button',{name:'Convert back to table',exact:true})).toBeVisible();
  const input=page.getByRole('textbox',{name:'Workstream',exact:true}).first();
  const old=await input.inputValue(),updated='Launch lead updated';
  await input.fill(updated);
  const databaseId=new URL(page.url()).pathname.split('/').pop();
  const database=await api(`/api/databases/${databaseId}`),view=database.views[0],field=database.fields.find(f=>f.name==='Workstream');
  await expect.poll(async()=> (await api(`/api/databases/${databaseId}/views/${view.id}`)).records.some(r=>r.values[field.id]===updated)).toBe(true);
  await page.screenshot({path:`.artifacts/ui-convergence/tables-${page.viewportSize().width}-database.png`});
  await page.getByRole('button',{name:'Convert back to table',exact:true}).click();
  await expect(page).toHaveURL(`${origin}/app/pages/${pageId}`);
  const restored=(await api(`/api/pages/${pageId}`)).blocks[0].content;
  assert.deepEqual(restored,{...committed,rows:committed.rows.map(row=>({...row,cells:row.cells.map((value,i)=>i===0&&value===old?updated:value)}))});
  await page.screenshot({path:`.artifacts/ui-convergence/tables-${page.viewportSize().width}-restored.png`});
  await page.keyboard.press('ControlOrMeta+/');
  const reference=page.getByRole('dialog',{name:'Keyboard shortcuts'});
  await expect(reference).toContainText('Add a column after this cell');
  await reference.getByLabel('Search shortcuts').fill('row');
  await page.screenshot({path:`.artifacts/ui-convergence/tables-${page.viewportSize().width}-shortcuts.png`});
  await page.getByRole('button',{name:'Close shortcuts'}).click();
  const document=await api(`/api/pages/${pageId}`);
  await ok(context,origin,'POST',`/api/publishing/${pageId}`,{operationKey:randomUUID(),expectedRevisionId:document.page.revisionId,host:new URL(origin).host,slug:'release-readiness'});
  await page.goto(origin+'/p/release-readiness',{waitUntil:'networkidle'});
  await expect(page.locator('td[colspan="2"],th[colspan="2"]')).toHaveCount(1);
  await page.screenshot({path:`.artifacts/ui-convergence/tables-${page.viewportSize().width}-published.png`});
}
