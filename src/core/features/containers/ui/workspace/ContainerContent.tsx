import { useState } from 'react';
import { PageTree, type TreePage } from '../../../../app/ui/PageTree';

export function ContainerContent({ id, description, pages }: { id: string; description: string; pages: (TreePage & { labels?: string[] })[] }) {
  const [query, setQuery] = useState('');
  const [label, setLabel] = useState('');
  const matched = new Set(pages.filter(page => page.title.toLowerCase().includes(query.toLowerCase()) && (!label || page.labels?.some(value => value.toLocaleLowerCase() === label.toLocaleLowerCase()))).map(page => page.id));
  for (const page of pages) {
    if (!matched.has(page.id)) continue;
    let parent = page.parentPageId;
    const seen = new Set<string>();
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      matched.add(parent);
      parent = pages.find(item => item.id === parent)?.parentPageId;
    }
  }
  return <>
    <p>{description}</p>
    <label>Filter page titles<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <label>Filter labels<input type="search" value={label} list={`space-labels-${id}`} onChange={event => setLabel(event.target.value)} /></label>
    <datalist id={`space-labels-${id}`}>{[...new Set(pages.flatMap(page => page.labels ?? []))].sort().map(value => <option key={value} value={value} />)}</datalist>
    {query || label ? <button className="secondary-button" onClick={() => { setQuery(''); setLabel(''); }}>Clear page filter</button> : null}
    <PageTree pages={pages.filter(page => matched.has(page.id))} />
  </>;
}
