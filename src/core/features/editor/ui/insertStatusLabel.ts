import {sliceRichText} from './sliceRichText';
import type {EditorBlock,InlineSpan} from './types';

/** Insert a status into prose without turning either side into another block. */
export function insertStatusLabel(blocks:EditorBlock[],after:string|null,range:{anchor:number;focus:number}|undefined,label:InlineSpan) {
  const next=[...blocks], index=after?next.findIndex(block=>block.id===after):next.length-1;
  if(after && index<0)throw new Error('The insertion block changed. Choose the insertion point again.');
  const block=next[index];
  if(block && 'text' in block) {
    const length=block.text.reduce((sum,span)=>sum+span.text.length,0);
    const start=range?Math.min(range.anchor,range.focus):length,end=range?Math.max(range.anchor,range.focus):length;
    const before=sliceRichText(block.text,0,start), following=sliceRichText(block.text,end);
    const spacer=start>0 && !/\s$/.test(before.map(span=>span.text).join(''))?[{text:' '}]:[];
    next[index]={...block,text:[...before,...spacer,label,{text:' '},...following]};
    const offset=start+spacer.length+label.text.length+1;
    return {blocks:next,blockId:block.id,selection:{anchor:offset,focus:offset}};
  }
  const paragraph:EditorBlock={id:crypto.randomUUID(),type:'paragraph',text:[label,{text:' '}]};
  next.splice(after?index+1:next.length,0,paragraph);
  return {blocks:next,blockId:paragraph.id,selection:{anchor:label.text.length+1,focus:label.text.length+1}};
}
