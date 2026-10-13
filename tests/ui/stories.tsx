import { primitiveStories } from './stories-primitives';
import { fieldEditingStories } from './stories-field-editing';
import { databaseStories } from './stories-databases';
import { discoveryStories } from './stories-discovery';
import { workspaceStories } from './stories-workspace';
import { useState, type ReactNode } from 'react';
import { BlockEditor } from '../../src/core/features/editor/ui/BlockEditor';
import { SaveStatus, type SaveStatusState } from '../../src/core/features/editor/ui/SaveStatus';
import type { SurfaceState } from '../../src/core/ui';
import { blocks } from './fixtures';
export interface Story { id: string; title: string; clauses: string[]; render: () => ReactNode }
const record = (action: string) => { document.documentElement.dataset.lastAction=action; };
function EditorStory({state='ready'}:{state?:SurfaceState}) {
 const [value,setValue]=useState(blocks);
 return <section><h1 className="mx-auto max-w-reading px-6 pt-12 pb-6 text-h1 font-semibold text-ink">Team working agreement</h1><BlockEditor state={state} blocks={value} canEdit onChange={(id,next)=>setValue(old=>old.map(item=>item.id===id?next:item))} onInsert={()=>record('insert')} onDelete={id=>setValue(old=>old.filter(item=>item.id!==id))} onMove={()=>record('move')} onDuplicate={()=>record('duplicate')} onRetry={()=>record('retry')} onRequestAccess={()=>record('request-access')} footer={<SaveStatus state="unsaved"/>}/><output className="sr-only" data-testid="editor-value">{JSON.stringify(value)}</output></section>;
}
const states:SurfaceState[]=['ready','loading','empty','error','denied'];
export const stories:Story[]=[
 ...primitiveStories,
 ...fieldEditingStories, ...databaseStories, ...discoveryStories, ...workspaceStories,
 ...states.map(state=>({id:`editor-${state}`,title:`Editor · ${state}`,clauses:['BLOCK-001','BLOCK-002'],render:()=> <EditorStory state={state}/>})),
 ...(['saving','saved','failed','offline','unsaved'] as SaveStatusState[]).map(state=>({id:`save-${state}`,title:`Save state · ${state}`,clauses:['SAVE-001','SAVE-002','SAVE-004'],render:()=> <section className="mx-auto max-w-reading p-6"><h1 className="mb-6 text-h1 text-ink">Document save status</h1><SaveStatus state={state} failureMessage="Revision changed" recoveredDraft onRetry={()=>record('retry-save')}/></section>})),
];
