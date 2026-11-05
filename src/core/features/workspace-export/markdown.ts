import type { TableContent } from '../editor/tables/model';
import {htmlBlock, htmlBlockTree} from './html';
import type { BlockView } from '../../shared/api/content';
import { plainContent } from '../editor/validation';
import { headingAnchor, tocEntries, type TableOfContentsSettings } from '../editor/table-of-contents';
import { escapeMarkdown, markdownText } from './rich-text';

export function markdownBlock(block: BlockView, blocks: BlockView[]): string {
  const c = block.content as Record<string, any>, text = markdownText(c.text);
  switch (block.blockType) {
    case 'columns': return `<!-- slate:columns -->\n${htmlBlock(block,blocks)}\n<!-- /slate:columns -->`;
    case 'column': return '';
    case 'table-of-contents': return `<!-- slate:table-of-contents ${JSON.stringify(c)} -->\n${tocEntries(blocks, c as TableOfContentsSettings).map(entry => `${'  '.repeat(entry.depth)}- [${escapeMarkdown(entry.text)}](${entry.href})`).join('\n')}\n<!-- /slate:table-of-contents -->`;
    case 'heading': return `<a id="${headingAnchor(block.id).replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"></a>\n${'#'.repeat(Number(c.level ?? 1))} ${text}`;
    case 'code': return `\`\`\`${c.language ?? ''}\n${c.code ?? ''}\n\`\`\``;
    case 'divider': return '---';
    case 'quote': return text.split('\n').map(line => `> ${line}`).join('\n');
    case 'callout': return htmlBlock(block, blocks);
    case 'table': {
      const table = c as TableContent;
      if (table.merges?.length || table.headerColumn || Object.keys(table.colours ?? {}).length) return htmlBlock(block, blocks);
      const cell = (value: string) => escapeMarkdown(value).replaceAll('|', '\\|').replace(/\r?\n/g, '<br>');
      const row = (values: string[]) => `| ${values.map(cell).join(' | ')} |`;
      return [table.caption ? escapeMarkdown(table.caption) : '', row(table.columns), row(table.columns.map(() => '---')), ...table.rows.map(item => row(item.cells))].filter(Boolean).join('\n');
    }
    case 'task': return `- [${c.done ? 'x' : ' '}] ${text}`;
    case 'list': return c.variant === 'toggle' ? htmlBlock(block, blocks) : (c.items ?? []).map((item: any, index: number) => `${c.variant === 'numbered' ? `${index + Number(c.start ?? 1)}.` : '-'} ${markdownText(item.text)}`).join('\n');
    case 'media': return c.source?.fileId ? `[${escapeMarkdown(c.source.name ?? 'Attachment')}](../media/${c.source.fileId})` : plainContent(block.content);
    case 'file-card': return `[${escapeMarkdown(c.provider)} file](${c.url})`;
    case 'link-card': return `[${c.url ?? ''}](${c.url ?? ''})`;
    case 'expandable': return htmlBlock(block, blocks);
    default: return text || plainContent(block.content);
  }
}

export const markdownDocument = (title: string, blocks: BlockView[]) => `# ${escapeMarkdown(title)}\n\n${blocks.filter(block => !block.parentBlockId).map(block => blocks.some(child => child.parentBlockId === block.id) && !['columns', 'column'].includes(block.blockType) ? htmlBlockTree(block, blocks) : markdownBlock(block, blocks)).join('\n\n')}\n`;
