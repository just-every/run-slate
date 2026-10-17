import {useCreatePage} from '../../../../app/ui/useCreatePage';
import {DEFAULT_PAGE_TITLE} from '../../../../app/ui/pageDestination';
import {errorMessage} from '../../../../client/transport';
import { useState } from 'react';
import { useResource } from '../../../../client/useResource';
import { RequestState } from '../../../../app/ui/RequestState';
import type { TreePage } from '../../../../app/ui/PageTree';
import { AnalyticsPanel } from '../../../analytics/ui/workspace/AnalyticsPanel';
import { WorkspaceArchive } from '../../../archive/ui/WorkspaceArchive';
import { ContainerHome } from '../../../homes/ui/ContainerHome';
import { FavouriteControl } from '../../../navigation/ui/workspace/FavouriteControl';
import { BlogFeed } from '../../../posts/ui/BlogFeed';
import { TemplatesWorkspace } from '../../../templates/ui/workspace/TemplatesWorkspace';
import { ReadableExportDialog } from '../../../workspace-export/ui/ReadableExportDialog';
import { ContainerBulk } from './ContainerBulk';
import { ContainerContent } from './ContainerContent';
import { ContainerSettings } from './ContainerSettings';
import { ContainerWatch } from './ContainerWatch';
import type { Container } from './ContainerWorkspace';

export function ContainerDetail({ id, updated }: { id: string; updated: () => void }) {
  const resource = useResource<Container>(`/api/containers/${encodeURIComponent(id)}`);
  const pages = useResource<{ items: (TreePage & { labels?: string[] })[] }>(`/api/pages?containerId=${encodeURIComponent(id)}`);
  const creation=useCreatePage();
  const [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState('home');
  const available = pages.data?.items ?? [];
  return <RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
    {resource.data ? <section className="space-detail">
      <h3>{resource.data.name}</h3>
      <div className="space-actions"><FavouriteControl kind="container" id={id} /><ContainerWatch id={id} /><button className="secondary-button" aria-busy={creation.pending || undefined} onClick={() => void creation.create(async () => ({containerId:id,title:DEFAULT_PAGE_TITLE}))}>Create page in this space</button><button className="secondary-button" onClick={() => setExporting(true)}>Export space</button></div>
      {creation.error?<p role="alert">{errorMessage(creation.error)}</p>:null}
      {exporting ? <ReadableExportDialog id={id} container onClose={() => setExporting(false)} /> : null}
      <nav className="tabs" aria-label="Space navigation">{['home', 'content', 'blog', 'settings', 'templates', 'trash', 'bulk'].map(value => <button aria-pressed={tab === value} key={value} onClick={() => setTab(value)}>{value[0]!.toUpperCase() + value.slice(1)}</button>)}</nav>
      <a href={`/app/search?containerId=${encodeURIComponent(id)}`}>Search this space</a>
      {tab === 'home' ? <ContainerHome containerId={id} /> : null}
      {tab === 'blog' ? <BlogFeed containerId={id} /> : null}
      {tab === 'templates' ? <TemplatesWorkspace defaultContainerId={id} embedded /> : null}
      {tab === 'trash' ? <WorkspaceArchive containerId={id} embedded /> : null}
      {tab === 'bulk' ? <RequestState loading={pages.loading} error={pages.error} retry={pages.reload}><ContainerBulk pages={available} onSaved={pages.reload} /></RequestState> : null}
      {tab === 'content' ? <RequestState loading={pages.loading} error={pages.error} retry={pages.reload}><ContainerContent id={id} description={resource.data.description} pages={available} /></RequestState> : null}
      {tab === 'settings' ? <ContainerSettings container={resource.data} onSaved={async () => { await resource.reload(); updated(); }} /> : null}
      <details><summary>Readership</summary><AnalyticsPanel containerId={id} /></details>
    </section> : null}
  </RequestState>;
}
