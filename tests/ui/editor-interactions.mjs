import assert from 'node:assert/strict';
async function select(field, start, end=start) {
 await field.evaluate((root,{start,end})=>{
  root.focus();const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];let node;
  while((node=walker.nextNode()))nodes.push(node);
  const locate=offset=>{for(const item of nodes){if(offset<=item.length)return[item,offset];offset-=item.length;}return[root,root.childNodes.length];};
  getSelection().setBaseAndExtent(...locate(start),...locate(end));
 },{start,end});
}
export async function checkEditorInteractions(page,base) {
 const load=()=>page.goto(`${base}/?story=editor-ready`);
 const values=async()=>JSON.parse(await page.getByTestId('editor-value').innerText());
 const paragraph=()=>page.getByRole('textbox',{name:'Paragraph',exact:true});
 await load();await select(paragraph().first(),5);await page.keyboard.type('XYZ');
 let blocks=await values();assert.equal(blocks[0].text[0].text,'Our sXYZhared knowledge ');assert.deepEqual(blocks[0].text[0].marks,['bold']);
 await load();await select(paragraph().first(),4,24);await page.keyboard.type('replacement');
 blocks=await values();assert.equal(blocks[0].text.map(s=>s.text).join(''),'Our replacementrts with a clear record.');
 await load();let field=paragraph().nth(1);const text=await field.innerText();await select(field,text.indexOf('source')+3);await page.keyboard.type('XYZ');
 blocks=await values();assert.equal(blocks[2].text.find(s=>s.link)?.text,'souXYZrce');assert.equal(blocks[2].text.find(s=>s.link)?.link.href,'https://example.org/source');assert.equal(blocks[2].text.find(s=>s.commentAnchorId)?.commentAnchorId,'thread-1');
 await load();field=paragraph().nth(1);await field.click();await page.keyboard.press('End');await page.keyboard.type(' tail');
 blocks=await values();assert.equal(blocks[2].text.at(-1).text,' tail');assert.equal(blocks[2].text.filter(s=>s.mention).length,1);assert.equal(blocks[2].text.find(s=>s.mention)?.mention.id,'alex');
 await load();await select(paragraph().first(),5);await page.keyboard.press('Enter');await page.keyboard.type('XYZ');
 blocks=await values();assert.equal(blocks[0].text.map(s=>s.text).join(''),'Our s\nXYZhared knowledge starts with a clear record.');
 const caret=await page.evaluate(()=>({offset:getSelection().anchorOffset,text:getSelection().anchorNode.textContent}));assert.equal(caret.offset,3);assert.equal(caret.text,'XYZhared knowledge ');
 await load();field=paragraph().first();await select(field,0,(await field.innerText()).length);await page.keyboard.press('Backspace');
 blocks=await values();assert.deepEqual(blocks[0].text,[],'deleting all content does not store a placeholder BR');
 await page.keyboard.press('Enter');blocks=await values();assert.equal(blocks[0].text.map(s=>s.text).join(''),'\n');
 await page.keyboard.type('xyz');blocks=await values();assert.equal(blocks[0].text.map(s=>s.text).join(''),'\nxyz');
 await load();field=paragraph().first();const original=await field.innerText();await select(field,original.length);await page.keyboard.press('Enter');
 blocks=await values();assert.equal(blocks[0].text.map(s=>s.text).join(''),original+'\n','terminal placeholder BR adds no second newline');
 await page.keyboard.press('Enter');await page.keyboard.type('x');blocks=await values();assert.equal(blocks[0].text.map(s=>s.text).join(''),original+'\n\nx');
 await load();field=paragraph().first();await select(field,(await field.innerText()).length);await page.keyboard.press('Shift+Enter');
 blocks=await values();assert.equal(blocks[0].text.map(s=>s.text).join(''),original+'\n');
 await page.keyboard.type('x');blocks=await values();assert.equal(blocks[0].text.map(s=>s.text).join(''),original+'\nx');
 return {name:'controlled React editor: repeated typing, mark replacement, link edits, mention append and Enter retain text and caret',passed:true};
}
