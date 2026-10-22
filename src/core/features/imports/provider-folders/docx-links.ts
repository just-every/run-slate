import {attributes,orderedText,valueFor,type OrderedNode} from '../docx-xml';
import type {ImportedLink} from '../types';
import {safeImportLink} from '../url';
/** Hyperlink ranges follow the same OOXML text walker as the document parser. */
export function docxLinks(value:unknown,relationships:Map<string,string>):ImportedLink[]{
 const links:ImportedLink[]=[];let position=0;const trim=orderedText(value).length-orderedText(value).trimStart().length;
 function visit(value:unknown){if(Array.isArray(value)){value.forEach(visit);return;}if(!value||typeof value!=='object')return;const node=value as OrderedNode;
  if('hyperlink'in node){const attrs=attributes(node),text=orderedText(valueFor(node,'hyperlink'));const href=attrs.id?relationships.get(attrs.id):attrs.anchor?`#${attrs.anchor}`:undefined;const link=href?safeImportLink(href):undefined;if(link&&text.length)links.push({...link,textStart:Math.max(0,position-trim),textEnd:position-trim+text.length});position+=text.length;return;}
  if('t'in node||'tab'in node||'br'in node||'cr'in node){position+=orderedText(node).length;return;}
  Object.entries(node).filter(([key])=>key!==':@').forEach(([,part])=>visit(part));
 }visit(value);return links;
}
