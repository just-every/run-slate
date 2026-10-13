import { SiteFooter } from '../landing/parts/SiteFooter';
import { SiteHeader } from '../landing/parts/SiteHeader';
import { DocsArticle } from './DocsArticle';
import { DocsMenu } from './DocsMenu';
import { DocsPager } from './DocsPager';
import { DocsSidebar } from './DocsSidebar';
import { DocsToc } from './DocsToc';
import type { DocsView } from './types';
import { useCurrentDocs } from './useCurrentDocs';
import '../landing/styles';
import './docs.css';

/** A documentation page in the landing's own header, footer, paper, ink and type. */
export function DocsPage({ page, sections, repository, version }: DocsView) {
  useCurrentDocs(version);
  const order = sections.flatMap(section => section.pages.map(entry => ({ ...entry, section: section.title })));
  const index = order.findIndex(entry => entry.slug === page.slug);
  const current = order[index];
  return <div className="slate-landing slate-docs" id="top">
    <a className="skip-link" href="#docs-content">Skip to the content</a>
    <SiteHeader page="docs" />
    <div className="docs-shell">
      <DocsSidebar sections={sections} current={page.slug} />
      <main id="docs-content" tabIndex={-1} className="docs-main">
        <DocsMenu sections={sections} current={page.slug} label={current.label} />
        <DocsArticle page={page} section={current.section} />
        <DocsPager previous={order[index - 1]} next={order[index + 1]} editUrl={`${repository.url}/edit/${repository.branch}/${page.source}`} />
      </main>
      <DocsToc toc={page.toc} />
    </div>
    <SiteFooter />
  </div>;
}
