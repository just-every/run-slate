import { useState } from 'react';
import { RequestState } from '../../../app/ui/RequestState';
import { useResource } from '../../../client/useResource';
import { PageWorkspace } from '../../pages/ui/workspace/PageWorkspace';
import { BlogFeed } from '../../posts/ui/BlogFeed';
import type { CompanyHubView, HomePageLink } from '../types';
import { HomeConfiguration } from './HomeConfiguration';

export function CompanyHub() {
  const resource = useResource<CompanyHubView>('/api/homes/company-hub');
  const [configuring, setConfiguring] = useState(false);
  return <section aria-label="Company hub">
    <h2>Company hub</h2>
    <RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
      {resource.data ? <>
        <div className="action-row">
          {resource.data.page ? <a href={resource.data.page.href}>Open company hub</a> : null}
          {resource.data.canConfigure ? <button type="button" onClick={() => setConfiguring(true)}>Curate company hub</button> : null}
        </div>
        {resource.data.state === 'unconfigured' ? <p>A workspace owner can choose the company hub page and curate useful links for the team.</p> : null}
        {resource.data.state === 'unavailable' ? <p role="status">The company hub page is unavailable with your current access. A workspace owner can review its selection and sharing.</p> : null}
        {resource.data.state === 'ready' && resource.data.page ? <>
          <PageWorkspace key={resource.data.page.id} pageId={resource.data.page.id} embedded />
          <HubLinks title="Chosen links" pages={resource.data.links} />
          <HubLinks title="Verified key pages" pages={resource.data.keyPages} />
          <BlogFeed heading="Company news" />
        </> : null}
        {configuring && resource.data.configuration ? <HomeConfiguration configuration={resource.data.configuration} onClose={() => setConfiguring(false)} onSaved={resource.reload} /> : null}
      </> : null}
    </RequestState>
  </section>;
}

function HubLinks({ title, pages }: { title: string; pages: HomePageLink[] }) {
  if (!pages.length) return null;
  return <section aria-label={title}><h3>{title}</h3><ul>{pages.map(page => <li key={page.id}><a href={page.href}>{page.title}</a></li>)}</ul></section>;
}
