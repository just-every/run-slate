import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useWorkspace} from '../../../../app/ui/WorkspaceContext';
import type {usePageEditor} from '../../../../client/usePageEditor';
import {errorMessage} from '../../../../client/transport';
import {BlockView} from '../../../editor/ui/blocks/BlockView';
import {Editable} from '../../../editor/ui/blocks/Editable';
import {typedBlock} from '../../../editor/ui/typedFormatting';
import {readEditableSelection,restoreEditableSelection,type EditableSelection} from '../../../editor/ui/blocks/editableSelection';
import {SaveStatus} from '../../../editor/ui/SaveStatus';
import type {EditorBlock} from '../../../editor/ui/types';
export function EmptyPageDraft({pageId,editor,onConversion,onSave}:{pageId:string;editor:ReturnType<typeof usePageEditor>;onConversion:(value:{block:EditorBlock;removed:number}|null)=>void;onSave:(id:string)=>(success:boolean)=>void}){
 const {member}=useWorkspace();const key=`slate:first-block:${member.id}:${pageId}`;
 const [draft,setDraft]=useState<EditorBlock>(()=>{const stored=typeof window==='undefined'?null:sessionStorage.getItem(key);if(stored){try{const value=JSON.parse(stored);if(typeof value.id==='string'&&Array.isArray(value.text))return {type:'paragraph',...value};}catch{sessionStorage.removeItem(key);editor.setFirstBlockDirty(false);}}return {id:crypto.randomUUID(),type:'paragraph',text:[]};});
 const recovered=useRef(typeof window!=='undefined'&&!!sessionStorage.getItem(key));
 const current=useRef(draft),busy=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const root=useRef<HTMLElement>(null),undo=useRef<EditorBlock|null>(null),focus=useRef<EditableSelection|null>(null);
 const [state,setState]=useState<'unsaved'|'saving'|'failed'|'offline'>('unsaved'),[error,setError]=useState('');
 useEffect(()=>{editor.setFirstBlockDirty(recovered.current);const before=(event:BeforeUnloadEvent)=>{if(sessionStorage.getItem(key)){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',before);return()=>{clearTimeout(timer.current);window.removeEventListener('beforeunload',before);};},[key]);
 async function save(){
  if(busy.current)return;const sent=current.current;busy.current=true;setState('saving');setError('');
  const field=root.current?.querySelector<HTMLElement>('[data-slate-editable]');
  const finishFocus=field===window.document.activeElement?onSave(sent.id):()=>{};
  try{await editor.structure([sent]);if(current.current!==sent)editor.change(sent.id,current.current);sessionStorage.removeItem(key);editor.setFirstBlockDirty(false);finishFocus(true);}
  catch(cause){finishFocus(false);setError(errorMessage(cause));setState(navigator.onLine?'failed':'offline');}
  finally{busy.current=false;}
 }
 function change(next:EditorBlock){editor.setFirstBlockDirty(true);current.current=next;setDraft(next);sessionStorage.setItem(key,JSON.stringify(next));clearTimeout(timer.current);if(!recovered.current&&state!=='failed'&&state!=='offline'){setState('unsaved');timer.current=setTimeout(()=>void save(),650);}}
 useLayoutEffect(()=>{if(!focus.current)return;const field=root.current?.querySelector<HTMLElement>('[data-slate-editable]');if(field){field.focus();restoreEditableSelection(field,focus.current);}focus.current=null;},[draft]);
 function edit(next:EditorBlock){
   const typed=typedBlock(next),conversion=typed?.type==='heading'?typed:null;undo.current=conversion?next:null;
   if(conversion){const field=root.current?.querySelector<HTMLElement>('[data-slate-editable]');const selection=field?readEditableSelection(field):null;const removed=next.type==='paragraph'?next.text.map(s=>s.text).join('').length-('text'in conversion?conversion.text.map(s=>s.text).join('').length:0):0;focus.current={anchor:Math.max(0,(selection?.anchor??removed)-removed),focus:Math.max(0,(selection?.focus??removed)-removed)};onConversion({block:next,removed});}else onConversion(null);
   change(conversion??next);
 }
 return <section ref={root} onKeyDown={event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'&&undo.current){event.preventDefault();event.stopPropagation();const previous=undo.current;undo.current=null;onConversion(null);focus.current={anchor:'text'in previous?previous.text.map(s=>s.text).join('').length:0,focus:'text'in previous?previous.text.map(s=>s.text).join('').length:0};change(previous);}}}>
 {draft.type==='paragraph'?<Editable label="Page body" value={draft.text} canEdit onChange={text=>edit({...draft,text})} placeholder="Add your first block to start writing."/>:<BlockView block={draft} canEdit onChange={edit}/>}
 {'text'in draft&&draft.text.length?<SaveStatus state={state} recoveredDraft={recovered.current} failureMessage={error} onRetry={()=>void save()}/>:null}
 {recovered.current&&state==='unsaved'?<button onClick={()=>void save()}>Save recovered first block</button>:null}
 </section>;
}
