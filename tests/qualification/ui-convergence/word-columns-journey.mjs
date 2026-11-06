import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {unzipSync} from 'fflate';
import {expect} from '@playwright/test';
import {wordColumnsFixture} from '../../helpers/word-columns-fixture.mjs';
import {assertPaginatedWordColumns} from '../../helpers/word-columns-pagination.mjs';
import {ok} from './two-people-support.mjs';

const require=createRequire(import.meta.url);

/** Download through the native dialog, then open the actual Word bytes with an
 * independent OOXML renderer. This stays in the existing columns registration. */
export async function wordColumnsJourney(state,width,containerId) {
  const {page,context,origin}=state;
  const corpus=wordColumnsFixture(randomUUID);
  const {value:{pageId}}=await ok(context,origin,'POST','/api/pages',{
    operationKey:randomUUID(),containerId,title:'Recovery handover in Word',blocks:corpus.blocks,
  });
  await page.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'More',exact:true}).click();
  await page.getByRole('menuitem',{name:'Export page',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Export readable content',exact:true});
  await dialog.getByLabel('Format',{exact:true}).selectOption('docx');
  await dialog.getByRole('checkbox',{name:'Include comments',exact:true}).uncheck();
  await page.screenshot({path:`.artifacts/ui-convergence/columns-word-${width}-dialog.png`});
  const pending=page.waitForEvent('download');
  const response=page.waitForResponse(result=>new URL(result.url()).pathname==='/api/exports/readable'&&result.request().method()==='POST');
  await dialog.getByRole('button',{name:'Download export',exact:true}).click();
  assert.equal((await response).status(),200);
  const file=await pending;
  assert.match(file.suggestedFilename(),/\.docx$/);
  const bytes=await readFile(await file.path());
  await writeFile(`.artifacts/ui-convergence/columns-word-${width}.docx`,bytes);
  const xml=new TextDecoder().decode(unzipSync(bytes)['word/document.xml']);
  assert.equal((xml.match(/<w:tbl>/g)??[]).length,4);
  for(const section of corpus.sections)for(const cell of section.cells){
    assert.ok(xml.includes(cell.heading));
    assert.ok(xml.includes(cell.end));
  }
  await expect(dialog).toHaveCount(0);
  // Functional geometry uses desktop width; the phone still drives the native
  // export and reads back its download, alongside the existing stacking proof.
  if(width!==1440)return;
  await assertRenderedWordColumns(context,bytes,corpus);
  console.log('PROBE BLOCK-012 Word: native dialog -> downloaded 2–5-column document -> exact rendered content, wrapping, independent heights and full-width following paragraphs across printed page boundaries');
}

export async function assertRenderedWordColumns(context,bytes,corpus) {
  const output=await context.newPage();
  try {
    await output.setContent('<html><body><main id="word"></main></body></html>');
    await output.addScriptTag({path:createRequire(require.resolve('docx-preview')).resolve('jszip/dist/jszip.min.js')});
    await output.addScriptTag({path:require.resolve('docx-preview')});
    await output.evaluate(async data=>{
      await window.docx.renderAsync(new Uint8Array(data),document.getElementById('word'),undefined,{inWrapper:true});
      await document.fonts.ready;
    },Array.from(bytes));
    const xml=new TextDecoder().decode(unzipSync(bytes)['word/document.xml']);
    const printableHeight=await output.evaluate(xml=>{
      const document=new DOMParser().parseFromString(xml,'application/xml');
      const size=document.getElementsByTagName('w:pgSz')[0],margin=document.getElementsByTagName('w:pgMar')[0];
      return (Number(size.getAttribute('w:h'))-Number(margin.getAttribute('w:top'))-Number(margin.getAttribute('w:bottom')))/15;
    },xml);
    const tables=output.locator('#word table');
    await expect(tables).toHaveCount(4);
    const geometry=[];
    for(const [index,section] of corpus.sections.entries()){
      const cells=tables.nth(index).locator('tr').first().locator('td');
      await expect(cells).toHaveCount(section.count);
      const bounds=[];
      for(const [cellIndex,expected] of section.cells.entries()){
        const cell=cells.nth(cellIndex);
        // Exact content includes every checkpoint line, escaped punctuation and
        // final sentinel; checking just the headings would miss truncation.
        const text=await cell.innerText();
        assert.equal(text.replace(/\s+/g,' ').trim(),[expected.heading,expected.text,expected.end].join(' ').replace(/\s+/g,' ').trim());
        const heading=cell.locator('p').filter({hasText:new RegExp('^'+expected.heading+'$')});
        await expect(heading).toBeVisible();
        const style=await heading.locator('span').first().evaluate(element=>({weight:getComputedStyle(element).fontWeight,size:parseFloat(getComputedStyle(element).fontSize)}));
        const normal=await cell.locator('p').filter({hasText:expected.end}).locator('span').first().evaluate(element=>({weight:getComputedStyle(element).fontWeight,size:parseFloat(getComputedStyle(element).fontSize)}));
        assert.ok(Number(style.weight)>Number(normal.weight)&&style.size>=normal.size,'Headings retain bold Word styling without shrinking body text.');
        const box=await cell.boundingBox(),headingBox=await heading.boundingBox();
        bounds.push({cell:box,heading:headingBox});
        const lines=await cell.locator('p').filter({hasText:expected.text.split('\n')[0]}).evaluate(element=>{
          const range=document.createRange();range.selectNodeContents(element);
          return Array.from(range.getClientRects()).map(rect=>({x:rect.x,y:rect.y,right:rect.right,bottom:rect.bottom}));
        });
        assert.ok(new Set(lines.map(line=>Math.round(line.y))).size>expected.text.split('\n').length,'Long checkpoints wrap within their column.');
        assert.ok(lines.every(line=>line.x>=box.x-1&&line.right<=box.x+box.width+1&&line.y>=box.y-1&&line.bottom<=box.y+box.height+1),'Wrapped text stays inside its own cell.');
      }
      for(let n=1;n<bounds.length;n++){
        assert.ok(bounds[n].cell.x>=bounds[n-1].cell.x+bounds[n-1].cell.width-1,'Columns stay side by side.');
        assert.ok(Math.abs(bounds[n].heading.y-bounds[0].heading.y)<1,'Unequal content heights retain top alignment.');
      }
      const after=output.locator('#word p').filter({hasText:section.after});
      await expect(after).toHaveText(section.after);
      const afterBox=await after.boundingBox(),tableBox=await tables.nth(index).boundingBox();
      assert.ok(afterBox.y>=tableBox.y+tableBox.height-1,'Ordinary content follows the whole section.');
      assert.ok(Math.abs(afterBox.x-tableBox.x)<1&&afterBox.width>=tableBox.width-1,'Following paragraphs regain the full page width.');
      geometry.push({count:section.count,bounds,table:tableBox,after:afterBox});
    }
    assert.ok(geometry[0].table.height>printableHeight,'The tall first column exceeds the printable height of a page.');
    // Print the decoded Word rendering and inspect every physical page. This
    // exercises pagination without requiring an Office install in push Verify.
    // Slate's native PDF format remains outside this Word qualification.
    await output.addStyleTag({content:'@page{size:A4;margin:0} @media print{body{margin:0}.docx-wrapper{padding:0!important;background:white!important}section.docx{box-shadow:none!important;margin:0!important}}'});
    const printed=await output.pdf({format:'A4',printBackground:true});
    const printableWidth=await output.evaluate(xml=>{
      const document=new DOMParser().parseFromString(xml,'application/xml');
      const size=document.getElementsByTagName('w:pgSz')[0],margin=document.getElementsByTagName('w:pgMar')[0];
      return (Number(size.getAttribute('w:w'))-Number(margin.getAttribute('w:left'))-Number(margin.getAttribute('w:right')))/20;
    },xml);
    const pagination=await assertPaginatedWordColumns(printed,corpus,printableWidth);
    await writeFile('.artifacts/ui-convergence/columns-word-printed.pdf',printed);
    await writeFile('.artifacts/ui-convergence/columns-word-rendered.json',JSON.stringify({renderer:'docx-preview',geometry,pagination},null,2));
    await output.screenshot({path:'.artifacts/ui-convergence/columns-word-rendered.png',fullPage:true});
  } finally {await output.close();}
}
