import {newBlock} from './newBlock';
import type {InsertKind} from './blockCatalog';
import type {EditorBlock, RichText} from './types';
import {sliceRichText} from './sliceRichText';
export function typedBlock(block: EditorBlock): EditorBlock | null {
  if(block.type !== 'paragraph') return null;
  const heading = /^(#{1,3})[ \u00a0]/u.exec(block.text.map(span => span.mention || span.status ? '\uFFFC' : span.text).join(''));
  if (heading) return {id:block.id, indent:block.indent, type:'heading', level:heading[1].length as 1|2|3, text:sliceRichText(block.text,heading[0].length)};
  if(block.text.length !== 1 || block.text[0].marks?.length || block.text[0].mention || block.text[0].status) return null;
  const shortcut:Record<string,InsertKind>={'- ':'bulleted-list','* ':'bulleted-list','1. ':'numbered-list','> ':'quote','" ':'quote','[] ':'task','[ ] ':'task','---':'divider','```':'code'};
  const kind=shortcut[block.text[0].text];
  return kind ? {...newBlock(kind,block.id),indent:block.indent} : null;
}
export function typedInline(value:RichText):RichText|null {
  const last=value.at(-1);if(!last || last.mention || last.status || last.marks?.length) return null;
  const match=/(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)$/u.exec(last.text);
  if(!match || (match[3] && (last.text[match.index-1] === "*" || last.text.startsWith("**")))) return null;
  const prefix=last.text.slice(0,match.index);
  return [...value.slice(0,-1),...(prefix?[{...last,text:prefix}]:[]),{...last,text:match[2]??match[3]??match[4],marks:[match[2]?'bold':match[3]?'italic':'code']}];
}
