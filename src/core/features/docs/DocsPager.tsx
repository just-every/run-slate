import { DocsLink } from './DocsLink';
import type { DocsNavPage } from './types';
import { HydrationUnit } from '../../../base/runtime/hydration/unit';

/** Previous and next in manifest order, then the page's source on GitHub. */
export function DocsPager({ previous, next, editUrl }: { previous?: DocsNavPage; next?: DocsNavPage; editUrl: string }) {
  return <>
    <HydrationUnit>
      <nav className="docs-pager" aria-label="Previous and next pages">
        {previous && <DocsLink slug={previous.slug} className="docs-pager-card docs-pager-card--previous" rel="prev">
          <span className="docs-pager-label">Previous</span><span className="docs-pager-title">{previous.label}</span>
        </DocsLink>}
        {next && <DocsLink slug={next.slug} className="docs-pager-card docs-pager-card--next" rel="next">
          <span className="docs-pager-label">Next</span><span className="docs-pager-title">{next.label}</span>
        </DocsLink>}
      </nav>
    </HydrationUnit>
    <HydrationUnit><p className="docs-source"><a href={editUrl}>Edit this page on GitHub</a></p></HydrationUnit>
  </>;
}
