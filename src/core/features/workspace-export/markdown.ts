import type { BlockView } from '../../shared/api/content';
import { plainContent } from '../editor/validation';
import { headingAnchor, tocEntries, type TableOfContentsSettings } from '../editor/table-of-contents';
import { escapeMarkdown, markdownText } from './rich-text';

export function markdownBlock(block: BlockView, blocks: BlockView[]): string {
  const c = block.content as Record<string, any>, text = markdownText(c.text);
  switch (block.blockType) {
    case 'table-of-contents': return `<!-- slate:table-of-contents ${JSON.stringify(c)} -->\n${tocEntries(blocks, c as TableOfContentsSettings).map(entry => `${'  '.repeat(entry.depth)}- [${escapeMarkdown(entry.text)}](${entry.href})`).join('\n')}\n<!-- /slate:table-of-contents -->`;
    case 'heading': return `<a id="${headingAnchor(block.id).replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"></a>\n${'#'.repeat(Number(c.level ?? 1))} ${text}`;
    case 'code': return `\`\`\`${c.language ?? ''}\n${c.code ?? ''}\n\`\`\``;
    case 'divider': return '---';
    case 'quote': return `> ${text}`;
    case 'task': return `- [${c.done ? 'x' : ' '}] ${text}`;
    case 'list': return (c.items ?? []).map((item: any, index: number) => `${c.variant === 'numbered' ? `${index + 1}.` : '-'} ${markdownText(item.text)}`).join('\n');
    case 'media': return c.source?.fileId ? `[${escapeMarkdown(c.source.name ?? 'Attachment')}](../media/${c.source.fileId})` : plainContent(block.content);
    case 'file-card': return `[${escapeMarkdown(c.provider)} file](${c.url})`;
    case 'link-card': return `[${c.url ?? ''}](${c.url ?? ''})`;
    case 'expandable': return `${escapeMarkdown(c.summary ?? '')}\n\n${markdownText(c.content)}`;
    default: return text || plainContent(block.content);
  }
}

export const markdownDocument = (title: string, blocks: BlockView[]) => `# ${escapeMarkdown(title)}\n\n${blocks.map(block => markdownBlock(block, blocks)).join('\n\n')}\n`;
