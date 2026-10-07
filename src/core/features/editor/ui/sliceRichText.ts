import type {RichText} from './types';
/** UTF-16 ranges match DOM selection offsets and preserve every inline property. */
export function sliceRichText(text:RichText,start:number,end=Infinity):RichText{
 let offset=0;return text.flatMap(span=>{const from=Math.max(0,start-offset),to=Math.min(span.text.length,end-offset);offset+=span.text.length;return to>from?[{...span,text:span.text.slice(from,to)}]:[];});
}
