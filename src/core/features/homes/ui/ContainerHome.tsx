import { useState } from 'react';
import { RequestState } from '../../../app/ui/RequestState';
import { useResource } from '../../../client/useResource';
import { PageWorkspace } from '../../pages/ui/workspace/PageWorkspace';
import type { HomeView } from '../types';
import { HomeConfiguration } from './HomeConfiguration';

export function ContainerHome({ containerId }: { containerId: string }) {
  const resource = useResource<HomeView>(`/api/homes/containers/${encodeURIComponent(containerId)}`);
  const [configuring, setConfiguring] = useState(false);
  return <section aria-label="Space home">
    <RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
      {resource.data ? <>
        <div className="action-row">
          {resource.data.page ? <a href={resource.data.page.href}>Open home page</a> : null}
          {resource.data.canConfigure ? <button type="button" onClick={() => setConfiguring(true)}>Choose home page</button> : null}
        </div>
        {resource.data.state === 'unconfigured' ? <p>No home page has been selected for this space. Its administrator can choose an existing page. Browse Content to see its pages.</p> : null}
        {resource.data.state === 'unavailable' ? <p role="status">This space’s home page is unavailable with your current access. Browse Content to see the pages you can read.</p> : null}
        {resource.data.state === 'ready' && resource.data.page ? <PageWorkspace key={resource.data.page.id} pageId={resource.data.page.id} embedded /> : null}
        {configuring && resource.data.configuration ? <HomeConfiguration containerId={containerId} configuration={resource.data.configuration} onClose={() => setConfiguring(false)} onSaved={resource.reload} /> : null}
      </> : null}
    </RequestState>
  </section>;
}
