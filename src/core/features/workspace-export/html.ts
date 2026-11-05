import {renderTable} from '../editor/tables/render';
import type {TableContent} from '../editor/tables/model';
import {blockAnchor,commentsHtml} from './comments';
import type {CommentArchive} from './comment-archive';
import { displayStyle, type PageDisplay } from './display';
import type { BlockView } from '../../shared/api/content';
import { plainContent } from '../editor/validation';
import { headingAnchor, tocEntries, type TableOfContentsSettings } from '../editor/table-of-contents';
import { renderTocList } from '../publishing/toc-render';
import { html } from '../publishing/html';
import { htmlText } from './rich-text';
import { statusLabelStyles } from '../publishing/block-styles';

import {layoutStyles} from '../editor/layout';

export function htmlBlock(block: BlockView, blocks: BlockView[], embeddedMarkdown = false): string {
  const c = block.content as Record<string, any>, text = htmlText(c.text);
  switch (block.blockType) {
    case 'columns': return `<section class="slate-columns" data-slate-columns="${c.count}" style="--column-count:${c.count}">${blocks.filter(child=>child.parentBlockId===block.id).map(child=>htmlBlock(child,blocks,embeddedMarkdown)).join('')}</section>`;
    case 'column': return `<div class="slate-column" data-slate-column="true">${blocks.filter(child=>child.parentBlockId===block.id).map(child=>htmlBlockTree(child,blocks,embeddedMarkdown)).join('')}</div>`;
    case 'table-of-contents': return `<nav aria-label="Table of contents" data-slate-table-of-contents="${html(JSON.stringify(c))}">${renderTocList(tocEntries(blocks, c as TableOfContentsSettings))}</nav>`;
    case 'heading': return `<h${c.level} id="${html(headingAnchor(block.id))}">${text}</h${c.level}>`;
    case 'code': {
      const code = html(c.code ?? '');
      // Character references keep blank code lines inside Markdown's raw HTML block.
      return `<pre><code class="language-${html(c.language ?? '')}">${embeddedMarkdown ? code.replaceAll('\r', '&#13;').replaceAll('\n', '&#10;') : code}</code></pre>`;
    }
    case 'divider': return '<hr>';
    case 'quote': return `<blockquote>${text}</blockquote>`;
    case 'callout': return `<aside data-slate-callout-tone="${html(c.tone ?? 'neutral')}">${text}</aside>`;
    case 'task': return `<p>${c.done ? '☑' : '☐'} ${text}</p>`;
    case 'list': {
      if (c.variant === 'toggle') return `<ul>${(c.items ?? []).map((item: any) => `<li><details${item.open ? ' open' : ''}><summary>${htmlText(item.text)}</summary><div>${htmlText(item.detail)}</div></details></li>`).join('')}</ul>`;
      const tag = c.variant === 'numbered' ? 'ol' : 'ul';
      return `<${tag}${tag === 'ol' ? ` start="${Number(c.start ?? 1)}"` : ''}>${(c.items ?? []).map((item: any) => `<li>${htmlText(item.text)}</li>`).join('')}</${tag}>`;
    }
    case 'table': return renderTable(c as TableContent, block.id);
    case 'media': return c.source?.fileId ? `<a href="../media/${html(c.source.fileId)}">${html(c.source.name ?? 'Attachment')}</a>` : `<p>${html(plainContent(block.content))}</p>`;
    case 'file-card': return `<p>${htmlText([{text: c.provider + ' file', link: {href: c.url}}])}</p>`;
    case 'link-card': return `<p>${htmlText([{text: c.url ?? '', link: {href: c.url ?? ''}}])}</p>`;
    case 'expandable': return `<details${c.open ? ' open' : ''}><summary>${html(c.summary ?? '')}</summary><p>${htmlText(c.content)}</p></details>`;
    default: return `<p>${text || html(plainContent(block.content))}</p>`;
  }
}

/** Render ordinary descendants inside their parent; layout blocks own their columns. */
export function htmlBlockTree(block: BlockView, blocks: BlockView[], embeddedMarkdown = false): string {
  const children = ['columns', 'column'].includes(block.blockType) ? [] : blocks.filter(child => child.parentBlockId === block.id);
  return `<div id="${html(blockAnchor(block.id))}">${htmlBlock(block, blocks, embeddedMarkdown)}${children.length ? `<div class="slate-block-children" style="margin-inline-start:20px">${children.map(child => htmlBlockTree(child, blocks, embeddedMarkdown)).join('')}</div>` : ''}</div>`;
}

export function htmlDocument(title: string, blocks: BlockView[], display: PageDisplay, comments?: CommentArchive): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(title)}</title><style>body{${displayStyle(display)};margin:40px auto;padding:0 24px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px}pre{white-space:pre-wrap}nav ul{padding-left:24px}${statusLabelStyles}${layoutStyles}</style></head><body><h1>${html(title)}</h1>${blocks.filter(block => !block.parentBlockId).map(block => htmlBlockTree(block, blocks)).join('\n')}${comments?commentsHtml(comments):''}</body></html>`;
}
