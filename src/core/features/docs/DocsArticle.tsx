import { DocsTocCompact } from './DocsToc';
import type { DocsPageData } from './types';
import { HydrationUnit } from '../../../base/runtime/hydration/unit';

/** The page's title and its body, rendered from Markdown at build time. */
export function DocsArticle({ page, section }: { page: DocsPageData; section: string }) {
  return <>
    <HydrationUnit>
      <header className="docs-page-head">
        <p className="docs-eyebrow">{section}</p>
        <h1 id={page.titleId} className="docs-title">{page.title}</h1>
      </header>
    </HydrationUnit>
    <HydrationUnit><DocsTocCompact toc={page.toc} /></HydrationUnit>
    <HydrationUnit><div className="docs-prose" dangerouslySetInnerHTML={{ __html: page.html }} /></HydrationUnit>
  </>;
}
