import {newBlock} from './newBlock';
import type {InsertKind} from './blockCatalog';
import type {EditorBlock, RichText} from './types';
export function typedBlock(block: EditorBlock): EditorBlock | null {
  if(block.type !== 'paragraph' || block.text.length !== 1 || block.text[0].marks?.length) return null;
  const shortcut:Record<string,InsertKind>={'# ':'heading-1','## ':'heading-2','### ':'heading-3','- ':'bulleted-list','* ':'bulleted-list','1. ':'numbered-list','> ':'quote','" ':'quote','[] ':'task','[ ] ':'task','---':'divider','```':'code'};
  const kind=shortcut[block.text[0].text];
  return kind ? {...newBlock(kind,block.id),indent:block.indent} : null;
}
export function typedInline(value:RichText):RichText|null {
  const last=value.at(-1);if(!last || last.mention || last.marks?.length) return null;
  const match=/(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)$/u.exec(last.text);
  if(!match || (match[3] && (last.text[match.index-1] === "*" || last.text.startsWith("**")))) return null;
  const prefix=last.text.slice(0,match.index);
  return [...value.slice(0,-1),...(prefix?[{...last,text:prefix}]:[]),{...last,text:match[2]??match[3]??match[4],marks:[match[2]?'bold':match[3]?'italic':'code']}];
}
