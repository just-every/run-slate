import { commentSubmitStories } from './stories-comment-submit';
import { fieldEditingStories } from './stories-field-editing';
import { databaseStories } from './stories-databases';
import { discoveryStories } from './stories-discovery';
import { operationsStories } from './stories-operations';
import { workspaceStories } from './stories-workspace';
import { collaborationStories } from './stories-collaboration';
import { useState, type ReactNode } from 'react';
import { BlockEditor } from '../../src/core/features/editor/ui/BlockEditor';
import { SaveStatus, type SaveStatusState } from '../../src/core/features/editor/ui/SaveStatus';
import { HomeScreen } from '../../src/core/features/navigation/ui/HomeScreen';
import type { SurfaceState } from '../../src/core/ui';
import { blocks, entries } from './fixtures';
export interface Story { id: string; title: string; clauses: string[]; render: () => ReactNode }
const record = (action: string) => { document.documentElement.dataset.lastAction=action; };
function EditorStory({state='ready'}:{state?:SurfaceState}) {
 const [value,setValue]=useState(blocks);
 return <section><h1 className="mx-auto max-w-reading px-6 pt-12 pb-6 text-h1 font-semibold text-ink">Team working agreement</h1><BlockEditor state={state} blocks={value} canEdit onChange={(id,next)=>setValue(old=>old.map(item=>item.id===id?next:item))} onInsert={()=>record('insert')} onDelete={id=>setValue(old=>old.filter(item=>item.id!==id))} onMove={()=>record('move')} onDuplicate={()=>record('duplicate')} onRetry={()=>record('retry')} onRequestAccess={()=>record('request-access')} footer={<SaveStatus state="unsaved"/>}/><output className="sr-only" data-testid="editor-value">{JSON.stringify(value)}</output></section>;
}
const states:SurfaceState[]=['ready','loading','empty','error','denied'];
export const stories:Story[]=[
 ...commentSubmitStories,
 ...fieldEditingStories, ...databaseStories, ...discoveryStories, ...operationsStories, ...workspaceStories, ...collaborationStories,
 ...states.map(state=>({id:`editor-${state}`,title:`Editor · ${state}`,clauses:['BLOCK-001','BLOCK-002'],render:()=> <EditorStory state={state}/>})),
 ...states.map(state=>({id:`home-${state}`,title:`Home · ${state}`,clauses:['NAV-001'],render:()=> <HomeScreen state={state} recents={entries} favourites={entries.slice(0,1)} containers={[{id:'team',name:'Team knowledge',icon:'📚',memberCount:4}]} onOpen={()=>record('open')} onOpenContainer={()=>record('open-container')} onCreatePage={()=>record('create')} onRetry={()=>record('retry')}/>})),
 ...(['saving','saved','failed','offline','unsaved'] as SaveStatusState[]).map(state=>({id:`save-${state}`,title:`Save state · ${state}`,clauses:['SAVE-001','SAVE-002','SAVE-004'],render:()=> <section className="mx-auto max-w-reading p-6"><h1 className="mb-6 text-h1 text-ink">Document save status</h1><SaveStatus state={state} failureMessage="Revision changed" recoveredDraft onRetry={()=>record('retry-save')}/></section>})),
];
