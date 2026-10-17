import type { BlockView } from '../../shared/api/content';
import { plainContent } from '../editor/validation';
import { headingAnchor, tocEntries, type TableOfContentsSettings } from '../editor/table-of-contents';
import { pdfText } from './rich-text';

export interface PdfLine {text: string; anchor?: string; href?: string; depth?: number}
export function pdfContent(blocks: BlockView[]): PdfLine[] {
  return blocks.flatMap((block): PdfLine[] => {
    const c = block.content as Record<string, any>;
    if (block.blockType === 'table-of-contents') return [...tocEntries(blocks, c as TableOfContentsSettings).map(entry => ({text: `• ${entry.text}`, href: entry.href, depth: entry.depth})), {text: ''}];
    if (block.blockType === 'list') return [...(c.items ?? []).map((item: any, index: number) => ({text: `${c.variant === 'numbered' ? `${index + 1}.` : '•'} ${pdfText(item.text)}`})), {text: ''}];
    let text = pdfText(c.text) || plainContent(block.content);
    switch (block.blockType) {
      case 'code': text = String(c.code ?? ''); break;
      case 'expandable': text = `${c.summary ?? ''}\n${pdfText(c.content)}`; break;
      case 'media': if (c.source?.fileId) text = `${c.source.name ?? 'Attachment'} (../media/${c.source.fileId})`; break;
      case 'link-card': text = String(c.url ?? ''); break;
      case 'task': text = `[${c.done ? 'x' : ' '}] ${text}`; break;
      case 'quote': text = `> ${text}`; break;
      case 'divider': text = '---'; break;
    }
    return [...text.split(/\r?\n/).map((text, index) => ({text, ...(block.blockType === 'heading' && index === 0 ? {anchor: headingAnchor(block.id)} : {})})), {text: ''}];
  });
}
