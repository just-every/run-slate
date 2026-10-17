import {useDocumentHeadings} from './DocumentHeadings';
import type {BlockRenderProps,TableOfContentsBlockData} from '../types';

export function TableOfContentsBlock({block,canEdit,onChange}:BlockRenderProps<TableOfContentsBlockData>) {
  const entries=useDocumentHeadings(block);
  return <section className="my-2 rounded-card border border-line p-3" aria-label="Table of contents">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-body font-medium">On this page</h2>
      {canEdit?<details><summary className="cursor-pointer text-sm text-ink-muted">Contents settings</summary>
        <fieldset className="grid grid-cols-2 gap-2 py-2 text-sm"><legend className="sr-only">Heading levels and style</legend>
          <label>From level<select aria-label="Contents from level" value={block.minLevel} onChange={event=>{const minLevel=Number(event.target.value);onChange({...block,minLevel,maxLevel:Math.max(minLevel,block.maxLevel)});}}>{[1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
          <label>To level<select aria-label="Contents to level" value={block.maxLevel} onChange={event=>{const maxLevel=Number(event.target.value);onChange({...block,maxLevel,minLevel:Math.min(maxLevel,block.minLevel)});}}>{[1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
          <label className="col-span-2">Style<select aria-label="Contents style" value={block.style} onChange={event=>onChange({...block,style:event.target.value as 'flat'|'nested'})}><option value="nested">Nested</option><option value="flat">Flat</option></select></label>
        </fieldset>
      </details>:null}
    </div>
    {entries.length?<nav aria-label="Page contents"><ul className="mt-2 space-y-1">{entries.map(entry=><li key={entry.id} style={{paddingInlineStart:`${entry.depth*1.25}rem`}}><a className="text-accent underline underline-offset-2" href={entry.href}>{entry.text}</a></li>)}</ul></nav>:<p className="mt-2 text-sm text-ink-muted">No headings in this range.</p>}
  </section>;
}
