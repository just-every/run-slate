import type { Story } from './stories';
import type { SurfaceState } from '../../src/core/ui';
import { PageMovePicker } from '../../src/core/features/pages/ui/PageMovePicker';
import { PageOutline } from '../../src/core/features/pages/ui/PageOutline';
const action = () => { document.documentElement.dataset.lastAction = 'discovery-action'; };
export const discoveryStories: Story[] = [
 {id:"page-outline", title:"Page outline", clauses:["PAGE-013"], render:()=> <section className="mx-auto max-w-wide p-6"><h1 className="text-h1">Escalation guide</h1><PageOutline headings={[{id:"overview",text:"When to escalate",level:1},{id:"contacts",text:"Who to contact",level:2},{id:"followup",text:"After the incident",level:1}]} activeId="overview" onSelectHeading={action}/></section>},
 ...(['ready','loading','error','denied','empty'] as SurfaceState[]).map(state=>({id:`page-move-${state}`,title:`Page move · ${state}`,clauses:['PAGE-004'],render:()=> <PageMovePicker open onOpenChange={action} pageTitle="Escalation guide" currentPath="Team knowledge" childCount={2} destinations={[{id:'handbook',label:'Handbook',path:'Operations',kind:'page'}]} state={state} query="" onQueryChange={action} selectedDestinationId="handbook" onSelectDestination={action} onConfirm={action} onRetry={action}/>})),
];
