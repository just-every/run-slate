import { socialMetadata, renderPublicHeader } from './header-render';
import type { BlockView } from '../../shared/api/content';
import { safeUrl } from '../editor/validation';
export const html = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
function rich(value: any, links: Record<string, string>): string { if (!Array.isArray(value))
    return html(value ?? ''); return value.map(span => { let text = html(span.mention?.label ?? span.text ?? ''); for (const mark of span.marks ?? []) {
    const tag = ({ bold: 'strong', italic: 'em', underline: 'u', strikethrough: 's', code: 'code' } as Record<string, string>)[mark];
    if (tag)
        text = `<${tag}>${text}</${tag}>`;
} if (span.colour && ['yellow', 'blue', 'green', 'red', 'purple'].includes(span.colour))
    text = `<mark class="${span.colour}">${text}</mark>`; let href = span.link?.href; if (span.mention?.kind === 'page')
    href = links[span.mention.id]; if (typeof href === 'string' && href.startsWith('/app/'))
    href = Object.entries(links).find(([id]) => href.includes(id))?.[1]; if (href && (safeUrl(href) || href.startsWith('/p/')))
    text = `<a href="${html(href)}" rel="noopener noreferrer">${text}</a>`; return text; }).join(''); }
function renderBlock(b: BlockView, slug: string, links: Record<string, string>) { const c = b.content as Record<string, any>, id = html(b.id), text = rich(c.text, links); switch (b.blockType) {
    case 'heading': return `<h${c.level} id="${id}">${text}</h${c.level}>`;
    case 'divider': return '<hr>';
    case 'code': return `<pre id="${id}"><code>${html(c.code)}</code></pre>`;
    case 'quote': return `<blockquote id="${id}">${text}${c.attribution ? `<cite>${html(c.attribution)}</cite>` : ''}</blockquote>`;
    case 'callout': return `<aside id="${id}">${html(c.icon)} ${text}</aside>`;
    case 'expandable': return `<details id="${id}"><summary>${html(c.summary)}</summary>${rich(c.content, links)}</details>`;
    case 'task': return `<p id="${id}">${c.done ? '☑' : '☐'} ${text}</p>`;
    case 'list': {
        const tag = c.variant === 'numbered' ? 'ol' : 'ul';
        return `<${tag} id="${id}">${(c.items ?? []).map((item: any) => `<li>${c.variant === 'toggle' ? `<details><summary>${rich(item.text, links)}</summary>${rich(item.detail, links)}</details>` : rich(item.text, links)}</li>`).join('')}</${tag}>`;
    }
    case 'table': return `<table id="${id}"><caption>${html(c.caption)}</caption><thead><tr>${(c.columns ?? []).map((v: string) => `<th>${html(v)}</th>`).join('')}</tr></thead><tbody>${(c.rows ?? []).map((r: any) => `<tr>${r.cells.map((v: string) => `<td>${html(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    case 'media': {
        if (!c.source?.fileId)
            return `<p>${html(c.caption || c.source?.name || '')}</p>`;
        const base = `/p/${encodeURIComponent(slug)}/media/${encodeURIComponent(c.source.fileId)}`, url = `${base}?display=${encodeURIComponent(b.id)}`;
        return c.kind === 'image' ? `<figure><img src="${url}" alt="${html(c.alt)}"><figcaption>${html(c.caption)}</figcaption></figure>` : c.kind === 'audio' ? `<audio controls src="${url}"></audio>` : c.kind === 'video' ? `<video controls src="${url}"></video>` : `<a href="${base}">${html(c.source.name)}</a>`;
    }
    case 'link-card': {
        const url = c.url.startsWith('/app/') ? Object.entries(links).find(([id]) => c.url.includes(id))?.[1] : c.url;
        return url && (safeUrl(url) || url.startsWith('/p/')) ? `<p><a href="${html(url)}" rel="noopener noreferrer">${html(c.preview?.title ?? c.url)}</a></p>` : `<p>${html(c.preview?.title ?? c.url)}</p>`;
    }
    case 'content-query': return `<ul>${(c.results ?? []).map((r: any) => `<li><a href="${html(r.url)}">${html(r.title)}</a></li>`).join('')}</ul>`;
    default: return `<p id="${id}">${text}</p>`;
} }
export function renderPublicDocument(exposure: Record<string, any>, links: Record<string, string> = {}) { const p = JSON.parse(exposure.properties_json), blocks: BlockView[] = JSON.parse(exposure.body_json); const byParent = new Map<string | null, BlockView[]>(); for (const b of blocks) {
    const rows = byParent.get(b.parentBlockId) ?? [];
    rows.push(b);
    byParent.set(b.parentBlockId, rows);
} function tree(parent: string | null): string { return (byParent.get(parent) ?? []).map(b => `${renderBlock(b, exposure.slug, links)}${byParent.has(b.id) ? `<section class="nested">${tree(b.id)}</section>` : ''}`).join(''); } return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="${exposure.indexable ? 'index,follow' : 'noindex,nofollow'}"><title>${html(p.title)}</title>${socialMetadata(exposure,p.title)}<style>body{max-width:${p.fullWidth ? '1200' : '800'}px;margin:4rem auto;padding:0 24px;font:${p.smallText ? '16' : '18'}px/1.6 ${p.typeface === 'serif' ? 'Georgia,serif' : p.typeface === 'mono' ? 'monospace' : 'system-ui'};color:${exposure.theme === 'dark' ? '#eeeeee' : '#252525'};background:${exposure.theme === 'dark' ? '#171717' : '#ffffff'}}img,video{max-width:100%}pre{overflow:auto}blockquote,aside{border-left:3px solid #ccc;padding-left:1rem}.nested{margin-left:1.5rem}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:.5rem}mark{background:#fff0ad}mark.blue{background:#dceeff}mark.green{background:#dff4df}mark.red{background:#ffdddd}mark.purple{background:#edddff}</style></head><body><main>${renderPublicHeader(exposure)}<h1>${html(p.title)}</h1>${p.byline ? `<p>${html(p.byline)}</p>` : ''}${tree(null)}</main></body></html>`; }
