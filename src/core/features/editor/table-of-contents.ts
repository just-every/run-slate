export interface TableOfContentsSettings {
  minLevel: number;
  maxLevel: number;
  style: 'flat' | 'nested';
}
export interface TocEntry { id: string; level: number; text: string; depth: number; href: string }
export const headingAnchor = (id: string) => `block-${id}`;

/** Derive links from the displayed revision; never save a second copy of headings. */
export function tocEntries(blocks: readonly {id:string;blockType:string;content:unknown}[], settings: TableOfContentsSettings): TocEntry[] {
  const levels: number[] = [], entries: TocEntry[] = [];
  for (const block of blocks) {
    if (block.blockType !== 'heading') continue;
    const content = block.content as {level:number;text:{text:string;mention?:{label:string}}[]};
    if (content.level < settings.minLevel || content.level > settings.maxLevel) continue;
    const text = content.text.map(span => span.mention?.label ?? span.text).join('').trim();
    if (!text) continue;
    while (levels.length && levels.at(-1)! >= content.level) levels.pop();
    entries.push({id:block.id,level:content.level,text,depth:settings.style === 'flat' ? 0 : levels.length,href:`#${encodeURIComponent(headingAnchor(block.id))}`});
    levels.push(content.level);
  }
  return entries;
}
