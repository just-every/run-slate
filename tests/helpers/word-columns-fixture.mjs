/** A one-level paragraph and heading corpus, with an independently tall first
 * cell crossing a page and ordinary blocks between every pair of sections. */
export function wordColumnsFixture(uuid) {
  const blocks=[], sections=[];
  const add=(blockType,text,parentBlockId,level=2)=>{
    const block={id:uuid(),blockType,content:{text:[{text}],...(blockType==='heading'?{level}:{})},treePosition:String(blocks.length).padStart(4,'0'),...(parentBlockId?{parentBlockId}:{})};
    blocks.push(block);return text;
  };
  const before=add('paragraph','Before the column sections: recovery starts here.');
  for(const count of [2,3,4,5]){
    const group={id:uuid(),blockType:'columns',content:{count},treePosition:String(blocks.length).padStart(4,'0')};
    blocks.push(group);
    const cells=[];
    for(let index=0;index<count;index++){
      const column={id:uuid(),blockType:'column',content:{},parentBlockId:group.id,treePosition:String(blocks.length).padStart(4,'0')};
      blocks.push(column);
      const level=index%3+1;
      const heading=add('heading',`Section ${count} column ${index+1}`,column.id,level);
      const lineCount=count===2&&index===0?76:3+index*2;
      const text=Array.from({length:lineCount},(_,line)=>`Checkpoint ${count}.${index+1}.${line+1}: preserve the recovery plan & confirm <all> owners.`).join('\n');
      add('paragraph',text,column.id);
      const end=add('paragraph',`End of section ${count} column ${index+1}.`,column.id);
      cells.push({heading,text,end,level});
    }
    const after=add('paragraph',`After section ${count}: ordinary content spans the page again.`);
    sections.push({count,cells,after});
  }
  return {blocks,sections,before};
}
