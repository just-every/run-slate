import { useState } from 'react';
import type { Story } from './stories';
import type { SurfaceState } from '../../src/core/ui';
import { SearchResultsPage } from '../../src/core/features/search/ui/SearchResultsPage';
import type { SearchFilterState, SearchResultItem } from '../../src/core/features/search/ui/types';
import { ContainerIndex } from '../../src/core/features/navigation/ui/ContainerIndex';
import { PageDetailsPanel } from '../../src/core/features/pages/ui/PageDetailsPanel';
import { PageMovePicker } from '../../src/core/features/pages/ui/PageMovePicker';
import { PageTitle } from '../../src/core/features/pages/ui/PageTitle';
import { PageOutline } from '../../src/core/features/pages/ui/PageOutline';
const action = () => { document.documentElement.dataset.lastAction = 'discovery-action'; };
const person = { id: 'ada', name: 'Ada Chen' };
const filters: SearchFilterState = { kinds: [], containerIds: [], contributorIds: [], statusIds: [], updatedWindowId: null, includeArchived: false, includeTrashed: false, titleOnly: false };
const results: SearchResultItem[] = [{ id: 'guide', kind: 'page', titleSegments: [{ text: 'Escalation', matched: true }, { text: ' guide', matched: false }], contextSegments: [{ text: 'Contact the duty lead before changing the severity of an ', matched: false }, { text: 'escalation', matched: true }, { text: '.', matched: false }], containerName: 'Team knowledge', contributor: person, updatedLabel: 'Updated 12 September 2026', lifecycle: 'live', statusLabel: 'Verified' }];
function SearchStory({state}:{state:SurfaceState}) {
 const [query,setQuery]=useState('escalation'); const [current,setCurrent]=useState(filters);
 return <SearchResultsPage query={query} onQueryChange={setQuery} state={state} results={state==='ready'?results:[]} totalCount={state==='ready'?1:0} filters={current} filterOptions={{ kinds:['page','record','comment','container','template'],containers:[{id:'team',label:'Team knowledge'}],contributors:[{id:'ada',label:'Ada Chen'}],statuses:[],updatedWindows:[{id:'week',label:'Last seven days'}] }} onFiltersChange={setCurrent} onRemoveFilter={action} onClearFilters={()=>setCurrent(filters)} facets={state==='ready'?[{id:'container',label:'Container',values:[{id:'team',label:'Team knowledge',count:1,selected:false}]}]:[]} onToggleFacet={action} onOpenResult={action} onCreatePage={action} onRetry={action} />;
}
function PageStory({state}:{state:SurfaceState}) {
 const [title,setTitle]=useState('Escalation guide');
 return <section className="mx-auto max-w-wide p-6"><PageTitle title={title} onTitleChange={setTitle} canEdit={state==='ready'} onCommit={action}/><div className="mt-6 flex flex-col gap-6 sm:flex-row"><PageDetailsPanel state={state} details={state==='ready'?{owner:person,creator:person,contributors:[{id:'sam',name:'Sam Patel'}],createdLabel:'4 September 2026',updatedLabel:'12 September 2026',lengthLabel:'620 words',status:null,labels:['support','on-call'],totalViews:34,uniqueViewers:9,ownViewsLabel:'Includes 3 of your own views',linkedFrom:[{id:'handbook',title:'Team handbook'}]}:null} statusProfile="open-vocabulary" onRetry={action} onRequestAccess={action} onOpenPage={action}/>{state==='ready'?<PageOutline headings={[{id:'overview',text:'When to escalate',level:1},{id:'contacts',text:'Who to contact',level:2},{id:'followup',text:'After the incident',level:1}]} activeId="overview" onSelectHeading={action}/>:null}</div></section>;
}
export const discoveryStories: Story[] = [
 ...(['ready','loading','error','denied','empty'] as SurfaceState[]).map(state=>({id:`page-move-${state}`,title:`Page move · ${state}`,clauses:['PAGE-004'],render:()=> <PageMovePicker open onOpenChange={action} pageTitle="Escalation guide" currentPath="Team knowledge" childCount={2} destinations={[{id:'handbook',label:'Handbook',path:'Operations',kind:'page'}]} state={state} query="" onQueryChange={action} selectedDestinationId="handbook" onSelectDestination={action} onConfirm={action} onRetry={action}/>})),
 ...(['ready','empty','denied','error'] as SurfaceState[]).map(state=>({id:`search-${state}`,title:`Search · ${state}`,clauses:['SEARCH-001','SEARCH-002','SEARCH-003'],render:()=> <SearchStory state={state}/>})),
 ...(['ready','denied','loading'] as SurfaceState[]).map(state=>({id:`page-details-${state}`,title:`Page details · ${state}`,clauses:['PAGE-007','PAGE-010','PAGE-013'],render:()=> <PageStory state={state}/>})),
 ...(['ready','empty','denied'] as SurfaceState[]).map(state=>({id:`container-index-${state}`,title:`Container index · ${state}`,clauses:['NAV-004','CONT-001'],render:()=> <ContainerIndex state={state} containers={[{id:'team',name:'Team knowledge',icon:'📚',description:'Shared operating guides',visibility:'open',memberCount:8,grantCount:2,isPersonal:false,isMember:true}]} filters={{membership:'all',visibility:'any',includePersonal:false}} onFiltersChange={action} onOpen={action} onCreate={action} onRetry={action} onRequestAccess={action} accessPolicy="class-led"/>})),
];
