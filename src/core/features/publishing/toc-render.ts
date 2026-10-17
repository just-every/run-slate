import type { TocEntry } from '../editor/table-of-contents';
import { html } from './html';

/** Attach a deeper entry to the preceding heading, without empty list items. */
export function renderTocList(entries: TocEntry[]): string {
  type Item = {entry: TocEntry; children: Item[]};
  const roots: Item[] = [], stack: Item[] = [];
  for (const entry of entries) {
    while (stack.length && stack.at(-1)!.entry.depth >= entry.depth) stack.pop();
    const item: Item = {entry, children: []};
    (stack.at(-1)?.children ?? roots).push(item);
    stack.push(item);
  }
  const list = (items: Item[]): string => `<ul>${items.map(({entry, children}) => `<li><a href="${html(entry.href)}">${html(entry.text)}</a>${children.length ? list(children) : ''}</li>`).join('')}</ul>`;
  return list(roots);
}
