import type {BlockView} from '../../shared/api/content';
import {columnBlocks, layoutRoots} from '../editor/layout';
import {bookmark, wordBlock, type WordContentContext} from './docx-content';
import {paragraph} from './docx-xml';

// A fixed, borderless table keeps independent column heights together. Unlike
// newspaper sections, a long left column cannot flow into the next column.
// Rows deliberately remain splittable so content continues on the next page.
export function wordLayout(blocks:BlockView[], context:WordContentContext):string {
  return layoutRoots(blocks).map(block=>{
    if(block.blockType!=='columns')return wordBlock(block,blocks,context);
    const columns=blocks.filter(child=>child.parentBlockId===block.id&&child.blockType==='column');
    const pageWidth=11906-2*1440;
    const widths=columns.map((_,index)=>Math.floor(pageWidth*(index+1)/columns.length)-Math.floor(pageWidth*index/columns.length));
    const cells=columns.map((column,index)=>{
      const content=columnBlocks(blocks,column.id).map(child=>wordBlock(child,blocks,context)).join('');
      return `<w:tc><w:tcPr><w:tcW w:w="${widths[index]}" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>${paragraph(bookmark(context,column.id,''))}${content}${paragraph('')}</w:tc>`;
    }).join('');
    const borders=['top','left','bottom','right','insideH','insideV'].map(edge=>`<w:${edge} w:val="nil"/>`).join('');
    return paragraph(context.comments.mark(block.id,bookmark(context,block.id,'')))+
      `<w:tbl><w:tblPr><w:tblW w:w="${pageWidth}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(width=>`<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid><w:tr>${cells}</w:tr></w:tbl>`+
      paragraph('');
  }).join('');
}
