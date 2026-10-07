import {useEffect,useRef,useState} from 'react';
import {useWorkspace} from '../../../../app/ui/WorkspaceContext';
import type {usePageEditor} from '../../../../client/usePageEditor';
import {errorMessage} from '../../../../client/transport';
import {Editable} from '../../../editor/ui/blocks/Editable';
import {SaveStatus} from '../../../editor/ui/SaveStatus';
import type {RichText} from '../../../editor/ui/types';
export function EmptyPageDraft({pageId,editor}:{pageId:string;editor:ReturnType<typeof usePageEditor>}){
 const {member}=useWorkspace();const key=`slate:first-block:${member.id}:${pageId}`;
 const [draft,setDraft]=useState<{id:string;text:RichText}>(()=>{const stored=typeof window==='undefined'?null:sessionStorage.getItem(key);if(stored){try{const value=JSON.parse(stored);if(typeof value.id==='string'&&Array.isArray(value.text))return value;}catch{sessionStorage.removeItem(key);editor.setFirstBlockDirty(false);}}return {id:crypto.randomUUID(),text:[]};});
 const recovered=useRef(typeof window!=='undefined'&&!!sessionStorage.getItem(key));
 const current=useRef(draft),busy=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const [state,setState]=useState<'unsaved'|'saving'|'failed'|'offline'>('unsaved'),[error,setError]=useState('');
 useEffect(()=>{editor.setFirstBlockDirty(recovered.current);const before=(event:BeforeUnloadEvent)=>{if(sessionStorage.getItem(key)){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',before);return()=>{clearTimeout(timer.current);window.removeEventListener('beforeunload',before);};},[key]);
 async function save(){
  if(busy.current)return;const sent=current.current;busy.current=true;setState('saving');setError('');
  try{await editor.structure([{...sent,type:'paragraph'}]);if(current.current!==sent)editor.change(sent.id,{...current.current,type:'paragraph'});sessionStorage.removeItem(key);editor.setFirstBlockDirty(false);}
  catch(cause){setError(errorMessage(cause));setState(navigator.onLine?'failed':'offline');}
  finally{busy.current=false;}
 }
 return <section><Editable label="Page body" value={draft.text} canEdit onChange={text=>{editor.setFirstBlockDirty(true);const next={...current.current,text};current.current=next;setDraft(next);sessionStorage.setItem(key,JSON.stringify(next));clearTimeout(timer.current);if(!recovered.current&&state!=='failed'&&state!=='offline'){setState('unsaved');timer.current=setTimeout(()=>void save(),650);}}} placeholder="Add your first block to start writing."/>
 {draft.text.length?<SaveStatus state={state} recoveredDraft={recovered.current} failureMessage={error} onRetry={()=>void save()}/>:null}
 {recovered.current&&state==='unsaved'?<button onClick={()=>void save()}>Save recovered first block</button>:null}
 </section>;
}
