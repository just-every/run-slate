import { useResource } from '../../../../client/useResource';
import type { Crumb } from '../../../../app/ui/header/TopBar';
import type { TreePage } from '../../../../app/ui/PageTree';
import type { DocumentView } from '../../../../client/content';

/** Ancestor titles come from the same access-filtered list used by the tree. */
export function usePageTrail(document: DocumentView, supplied?: Crumb[]): Crumb[] {
  const pages = useResource<{items: TreePage[]}>(!supplied && document.parentPageId ? '/api/pages' : null);
  if (supplied) return supplied;
  const trail: Crumb[] = [{label: 'Pages', href: '/app'}];
  const ancestors: Crumb[] = [];
  const seen = new Set([document.page.id]);
  let id = document.parentPageId;
  while (id && !seen.has(id)) {
    seen.add(id);
    const parent = pages.data?.items.find(page => page.id === id);
    if (!parent) break;
    ancestors.unshift({label: parent.title || 'Untitled', href: `/app/pages/${encodeURIComponent(parent.id)}`});
    id = parent.parentPageId;
  }
  return [...trail, ...ancestors];
}
