import type { BlockView } from '../../shared/api/content';
import type { TableContent } from '../editor/tables/model';
import { tocEntries, type TableOfContentsSettings } from '../editor/table-of-contents';
import { plainContent } from '../editor/validation';
import { wordTable } from './docx-tables';
import { paragraph, run } from './docx-xml';
import type { WordComments } from './docx-comments';

interface Span {text?:string;marks?:string[];mention?:{kind:string;id?:string;label?:string};link?:{href:string}}
export interface WordContentContext {
  origin: string;
  pageId: string;
  bookmarks: Map<string, {id:number;name:string}>;
  excluded: ReadonlySet<string>;
  comments: WordComments;
  memberNames: ReadonlyMap<string,string>;
  image: (block:BlockView) => string | undefined;
  list: (variant:string,start:number) => number;
  hyperlink: (url:string,content:string) => string;
}
export function bookmark(context: WordContentContext, id: string, content: string): string {
  const anchor = context.bookmarks.get(id)!;
  return `<w:bookmarkStart w:id="${anchor.id}" w:name="${anchor.name}"/>${content}<w:bookmarkEnd w:id="${anchor.id}"/>`;
}
export function wordLink(context: WordContentContext, href: string, content: string, blockId: string): string {
  const url = new URL(href, context.origin);
  const pageId = url.origin === context.origin ? /^\/app\/pages\/([^/]+)$/.exec(url.pathname)?.[1] : undefined;
  const id = pageId ? decodeURIComponent(pageId) : undefined;
  if (id && context.excluded.has(id)) return '';
  const fragment = url.hash ? decodeURIComponent(url.hash.slice(1)).replace(/^block-/, '') : undefined;
  const target = url.origin === context.origin ? context.bookmarks.get(fragment ?? id ?? '') : undefined;
  if (target) return `<w:hyperlink w:anchor="${target.name}">${content}</w:hyperlink>`;
  // A non-document link opens the source in Slate. Never let Word fetch a
  // third-party image, template or target; authored off-site links live there.
  const slateUrl = url.origin === context.origin && /^\/(app\/|api\/media\/)/.test(url.pathname) ? url.href : `${context.origin}/app/pages/${encodeURIComponent(context.pageId)}#block-${encodeURIComponent(blockId)}`;
  return context.hyperlink(slateUrl, content);
}
export function wordText(context: WordContentContext, value: unknown, blockId: string): string {
  const spans: Span[] = Array.isArray(value) ? value : [{text:String(value ?? '')}];
  return spans.map(span => {
    const marks:Record<string,string> = {bold:'<w:b/>',italic:'<w:i/>',underline:'<w:u w:val="single"/>',strikethrough:'<w:strike/>',code:'<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>'};
    const content = run(span.mention?.label ?? span.text ?? '', (span.marks ?? []).map(mark => marks[mark] ?? '').join(''));
    const href = span.mention?.kind === 'page' && span.mention.id ? `/app/pages/${encodeURIComponent(span.mention.id)}` : span.link?.href;
    return href ? wordLink(context, href, content, blockId) : content;
  }).join('');
}
export function wordBlock(block:BlockView, blocks:BlockView[], context:WordContentContext):string {
  const c = block.content as Record<string,any>;
  const text = wordText(context,c.text,block.id);
  const p = (content:string,properties='') => paragraph(content,properties);
  let body: string;
  switch(block.blockType) {
    case 'heading': body=p(text,`<w:pStyle w:val="Heading${Number(c.level)}"/>`);break;
    case 'paragraph': body=p(text);break;
    case 'list': {
      const numId=context.list(c.variant,c.start ?? 1);
      body=(c.items ?? []).map((item:any)=>p(`${c.variant==='toggle'?run(item.open?'▾ ':'▸ '):''}${wordText(context,item.text,block.id)}`,`<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>`)+(c.variant==='toggle'&&item.detail?p(wordText(context,item.detail,block.id),'<w:ind w:left="720"/>'):'')).join('');break;
    }
    case 'task': body=p(run(c.done?'☑ ':'☐ ')+text+run(`${c.assigneeMemberId ? ` · ${context.memberNames.get(c.assigneeMemberId) ?? c.assigneeMemberId}` : ''}${c.dueDate ? ` · Due ${c.dueDate}` : ''}`));break;
    case 'table': body=wordTable(c as TableContent);break;
    case 'code': body=p(run(c.code,'<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>'),'<w:pStyle w:val="Code"/>');break;
    case 'callout': body=p(run(c.icon?`${c.icon} `:'')+text,'<w:pStyle w:val="Callout"/>');break;
    case 'quote': body=p(text+(c.attribution?run(` — ${c.attribution}`):''),'<w:pStyle w:val="Quote"/>');break;
    case 'divider': body=p('','<w:pBdr><w:bottom w:val="single" w:sz="6"/></w:pBdr>');break;
    case 'expandable': body=p(run(c.summary,'<w:b/>'))+p(wordText(context,c.content,block.id));break;
    case 'table-of-contents': body=tocEntries(blocks,c as TableOfContentsSettings).map(entry=>p(`<w:hyperlink w:anchor="${context.bookmarks.get(entry.id)!.name}">${run(entry.text)}</w:hyperlink>`,`<w:ind w:left="${entry.depth*360}"/>`)).join('');break;
    case 'media': {
      const image=context.image(block);
      if(c.kind==='image'&&c.source?.fileId&&!image){body='';break;}
      body=p(image ?? wordLink(context,`/app/pages/${context.pageId}#block-${block.id}`,run(c.source?.name ?? c.caption ?? ''),block.id))+(c.caption?p(run(c.caption)):'');break;
    }
    case 'link-card': body=p(wordLink(context,c.url,run(c.preview?.title ?? c.url),block.id));break;
    default: body=p(run(plainContent(block.content)));
  }
  // A separate paragraph also makes tables and empty blocks valid comment anchors.
  const anchor=paragraph(context.comments.mark(block.id,bookmark(context,block.id,'')));
  return anchor+body;
}
