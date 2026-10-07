import { useState } from 'react';
import type { Story } from './stories';
import { TemplateGallery, type TemplateGalleryProps } from '../../src/core/features/templates/ui/TemplateGallery';
import { VersionHistoryPanel, type VersionHistoryPanelProps } from '../../src/core/features/versions/ui/VersionHistoryPanel';
import { PublishToWebPanel, type PublishToWebPanelProps } from '../../src/core/features/publishing/ui/PublishToWebPanel';

const action = () => { document.documentElement.dataset.lastAction = 'document-collaboration-action'; };
function TemplatesStory({ state }: { state: TemplateGalleryProps['state'] }) {
  const [query, setQuery] = useState('');
  return <TemplateGallery state={state} query={query} onQueryChange={setQuery} categoryId="all" categories={[{ id: 'team', label: 'Teamwork' }]} onCategoryChange={action}
    templates={state === 'empty' ? [] : [
      { id: 'agreement', title: 'Team working agreement', description: 'Agree how the team communicates and makes decisions.', icon: '🤝', categoryId: 'team', categoryLabel: 'Teamwork', origin: 'shipped', home: { kind: 'workspace' }, outline: ['Our purpose', 'Communication', 'Making decisions'], childPageCount: 0 },
      { id: 'project', title: 'Project kickoff', description: 'Define the outcome, scope and owners before starting.', icon: '🚀', categoryId: 'team', categoryLabel: 'Teamwork', origin: 'custom', home: { kind: 'container', containerId: 'product', containerName: 'Product' }, outline: ['What we are building', 'Success criteria', 'Open questions'], childPageCount: 2 },
    ]} onOpen={action} onUse={action} onCreate={action} onRetry={action} errorDetail="The gallery request failed. No template was changed." />;
}
function VersionsStory({ state }: { state: VersionHistoryPanelProps['state'] }) {
  const [selectedIds, setSelectedIds] = useState<string[]>(['revision-3', 'revision-2']);
  return <div className="h-[600px]"><VersionHistoryPanel state={state} versionProfile="autosnapshot" activeId="revision-3" selectedIds={selectedIds} onToggleSelect={(id, selected) => setSelectedIds(ids => selected ? [...ids, id] : ids.filter(value => value !== id))}
    entries={[3, 2, 1].map((number) => ({ id: `revision-${number}`, ordinal: null, at: `September ${number + 7}, 2026 at 9:30 AM`, actorName: number === 2 ? 'Lee Morgan' : 'Maya Chen', origin: 'autosave', comment: null, statusLabel: null, isCurrent: number === 3, isPublished: false, tombstone: null }))}
    onOpen={action} onCompare={action} onRestore={action} onSummariseDifferences={action} onClose={action} onRetry={action} onRequestAccess={action} errorDetail="Revision history is temporarily unavailable." /></div>;
}
function PublishingStory({ state }: { state: PublishToWebPanelProps['state'] }) {
  const [published, setPublished] = useState(true);
  const [slug, setSlug] = useState('working-agreement');
  const [indexing, setIndexing] = useState(false);
  return <section className="max-w-md p-4"><PublishToWebPanel state={state} publicAccessProfile="site" published={published} canPublish
    exposure={{ host: 'docs.example.test', slug, url: `https://docs.example.test/p/${slug}`, theme: 'light', indexing, headerControls: [{ id: 'title', label: 'Page title', enabled: true }], duplicateAsTemplate: false, publishedAt: '2026-09-10T09:30:00Z', revokedAt: null }} hosts={[{ id: 'docs.example.test', name: 'docs.example.test' }]}
    onPublish={() => setPublished(true)} onUnpublish={() => setPublished(false)} onViewSite={action} onCopyUrl={action} onHostChange={action} onSlugChange={setSlug} onThemeChange={action} onHeaderControlChange={action} onDuplicateAsTemplateChange={action} onIndexingChange={setIndexing} onRetry={action} onRequestAccess={action} errorDetail="The public exposure record could not be loaded." /></section>;
}
export const documentCollaborationStories: Story[] = [
  ...(['ready', 'empty', 'error'] as const).map(state => ({ id: `templates-${state}`, title: `Templates · ${state}`, clauses: ['TMPL-001', 'TMPL-006'], render: () => <TemplatesStory state={state} /> })),
  ...(['ready', 'empty', 'denied', 'error'] as const).map(state => ({ id: `versions-${state}`, title: `Version history · ${state}`, clauses: ['REV-002', 'REV-004', 'REV-007'], render: () => <VersionsStory state={state} /> })),
  ...(['ready', 'denied', 'error'] as const).map(state => ({ id: `publishing-${state}`, title: `Publishing · ${state}`, clauses: ['WEB-001', 'WEB-002', 'WEB-005'], render: () => <PublishingStory state={state} /> })),
];
