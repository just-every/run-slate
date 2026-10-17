import type { BlockView } from '../../shared/api/content';
import { plainContent } from '../editor/validation';
import { headingAnchor, tocEntries, type TableOfContentsSettings } from '../editor/table-of-contents';
import { renderTocList } from '../publishing/toc-render';
import { html } from '../publishing/html';
import { htmlText } from './rich-text';
import { statusLabelStyles } from '../publishing/block-styles';

function htmlBlock(block: BlockView, blocks: BlockView[]): string {
  const c = block.content as Record<string, any>, text = htmlText(c.text);
  switch (block.blockType) {
    case 'table-of-contents': return `<nav aria-label="Table of contents" data-slate-table-of-contents="${html(JSON.stringify(c))}">${renderTocList(tocEntries(blocks, c as TableOfContentsSettings))}</nav>`;
    case 'heading': return `<h${c.level} id="${html(headingAnchor(block.id))}">${text}</h${c.level}>`;
    case 'code': return `<pre><code class="language-${html(c.language ?? '')}">${html(c.code ?? '')}</code></pre>`;
    case 'divider': return '<hr>';
    case 'quote': return `<blockquote>${text}</blockquote>`;
    case 'callout': return `<aside>${text}</aside>`;
    case 'task': return `<p>${c.done ? '☑' : '☐'} ${text}</p>`;
    case 'list': { const tag = c.variant === 'numbered' ? 'ol' : 'ul'; return `<${tag}>${(c.items ?? []).map((item: any) => `<li>${htmlText(item.text)}</li>`).join('')}</${tag}>`; }
    case 'table': return `<table><thead><tr>${(c.columns ?? []).map((cell: string) => `<th>${html(cell)}</th>`).join('')}</tr></thead><tbody>${(c.rows ?? []).map((row: any) => `<tr>${row.cells.map((cell: string) => `<td>${html(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    case 'media': return c.source?.fileId ? `<a href="../media/${html(c.source.fileId)}">${html(c.source.name ?? 'Attachment')}</a>` : `<p>${html(plainContent(block.content))}</p>`;
    case 'link-card': return `<p>${htmlText([{text: c.url ?? '', link: {href: c.url ?? ''}}])}</p>`;
    case 'expandable': return `<details><summary>${html(c.summary ?? '')}</summary><p>${htmlText(c.content)}</p></details>`;
    default: return `<p>${text || html(plainContent(block.content))}</p>`;
  }
}

export function htmlDocument(title: string, blocks: BlockView[]): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${html(title)}</title><style>body{max-width:780px;margin:40px auto;padding:0 24px;font:16px/1.6 system-ui,sans-serif}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px}pre{white-space:pre-wrap}nav ul{padding-left:24px}${statusLabelStyles}</style></head><body><h1>${html(title)}</h1>${blocks.map(block => htmlBlock(block, blocks)).join('\n')}</body></html>`;
}
