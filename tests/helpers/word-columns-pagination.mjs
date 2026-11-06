import assert from 'node:assert/strict';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';

const compact=text=>text.replace(/\s+/g,'');

/** Inspect the printed Word rendering, not Slate's separate PDF export. Keep
 * physical page coordinates so a tall DOM table alone cannot satisfy this. */
export async function assertPaginatedWordColumns(bytes,corpus,printableWidth) {
  const loading=getDocument({data:new Uint8Array(bytes)}),document=await loading.promise;
  try {
    const items=[];
    let offset=0;
    for(let index=1;index<=document.numPages;index++){
      const page=await document.getPage(index),viewport=page.getViewport({scale:1});
      const text=await page.getTextContent();
      for(const item of text.items){
        if(!('str' in item)||!item.str.trim())continue;
        const y=viewport.height-item.transform[5];
        assert.ok(y>=0&&y<=viewport.height,'Printed text stays on its physical page.');
        items.push({text:item.str,page:index,x:item.transform[4],y,width:item.width,height:item.height,position:offset+y});
      }
      offset+=viewport.height;
    }
    const locate=text=>{
      const matches=items.filter(item=>item.text===text);
      assert.equal(matches.length,1,`Printed ordinary paragraph occurs once: ${text}`);
      return matches[0];
    };
    const before=locate(corpus.before),geometry=[];
    let previous=before;
    for(const section of corpus.sections){
      const after=locate(section.after);
      assert.ok(after.position>previous.position,'Ordinary blocks retain section order.');
      assert.ok(Math.abs(after.x-before.x)<1,'Following ordinary blocks return to the page margin.');
      const cells=[];
      for(const [index,expected] of section.cells.entries()){
        const left=before.x+printableWidth*index/section.count;
        const right=before.x+printableWidth*(index+1)/section.count;
        const content=items.filter(item=>item.position>previous.position&&item.position<after.position&&item.x>=left-1&&item.x<right-1)
          .sort((a,b)=>a.position-b.position||a.x-b.x);
        assert.equal(compact(content.map(item=>item.text).join('')),compact(expected.heading+expected.text+expected.end),`Every printed character remains in section ${section.count}, column ${index+1}, in reading order.`);
        assert.ok(content.every(item=>item.x+item.width<=right+1),'Printed text stays within its column after page breaks.');
        cells.push({first:content[0],last:content.at(-1),pages:[...new Set(content.map(item=>item.page))]});
      }
      assert.ok(cells.every(cell=>Math.abs((cell.first.position-cell.first.height)-(cells[0].first.position-cells[0].first.height))<1.25),'Unequal columns begin together on the printed page.');
      assert.ok(cells.every(cell=>after.position>cell.last.position),'Following content clears every column, including continued text.');
      geometry.push({count:section.count,cells,after});
      previous=after;
    }
    assert.ok(geometry[0].cells[0].pages.length>1,'A populated column continues across an actual printed page boundary.');
    return {pages:document.numPages,geometry};
  } finally {await loading.destroy();}
}
