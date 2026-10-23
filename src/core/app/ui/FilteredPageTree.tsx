import { useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { PageTree, type TreePage } from './PageTree';
import { matchingTreeIds } from './treeFilter';

export function FilteredPageTree({ pages, spaceName, activePath }: { pages: TreePage[]; spaceName: string; activePath: string }) {
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const visibleIds = useMemo(() => matchingTreeIds(pages, query), [pages, query]);
  function clear() { setQuery(''); input.current?.focus(); }
  return <>
    <div className="tree-filter">
      <Search aria-hidden="true" />
      <input ref={input} type="text" aria-label={`Filter pages in ${spaceName}`} placeholder="Filter pages" value={query}
        onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && query) { event.preventDefault(); event.stopPropagation(); clear(); } }} />
      {query ? <button type="button" aria-label={`Clear page filter in ${spaceName}`} data-tooltip="Clear filter" data-tooltip-align="end" onClick={clear}><X aria-hidden="true" /></button> : null}
    </div>
    {visibleIds?.size === 0 ? <p className="empty-tree" role="status">No page titles match.</p> : <PageTree pages={pages} activePath={activePath} visibleIds={visibleIds} />}
  </>;
}
