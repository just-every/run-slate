import type { TreePage } from './PageTree';

/** Match only reader-visible titles, retaining only reader-visible ancestors. */
export function matchingTreeIds(pages: TreePage[], query: string): Set<string> | undefined {
  const term = query.trim().normalize('NFC').toLocaleLowerCase();
  if (!term) return undefined;
  const byId = new Map(pages.map(page => [page.id, page]));
  const retained = new Set<string>();
  for (const page of pages) {
    if (!page.title.normalize('NFC').toLocaleLowerCase().includes(term)) continue;
    let current: TreePage | undefined = page;
    while (current && !retained.has(current.id)) {
      retained.add(current.id);
      current = current.parentPageId ? byId.get(current.parentPageId) : undefined;
    }
  }
  return retained;
}
