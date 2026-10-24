import {useEffect,useState} from 'react';
import type {EditorBlock,SyncedReferenceBlockData,SyncedSourceBlockData,RichText} from '../types';
import {ParagraphBlock} from './ParagraphBlock';
import {useTaskPage} from './TaskPageContext';
import {mutate,operationKey,errorMessage} from '../../../../client/transport';
export function SyncedBlock({block,canEdit,onChange,actions}:{block:SyncedReferenceBlockData|SyncedSourceBlockData;canEdit:boolean;onChange:(next:EditorBlock)=>void;actions?:import('../types').BlockActions}){
 const page=useTaskPage(),resolution=block.synced;
 const [text,setText]=useState<RichText>((resolution?.text??[]) as RichText),[base,setBase]=useState(resolution?.sourceRevisionId),[dirty,setDirty]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState<unknown>();
 useEffect(()=>{if(!dirty){setText((resolution?.text??[]) as RichText);setBase(resolution?.sourceRevisionId);}},[resolution?.sourceRevisionId,dirty]);
 if(block.type==='synced-source')return <section aria-label="Synced source"><p className="text-ui text-ink-muted">Synced source {canEdit?<button type="button" onClick={()=>void navigator.clipboard.writeText(`${location.origin}/app/pages/${page?.pageId}#synced-block=${block.id}`).catch(setError)}>Copy synced block link</button>:null}</p><ParagraphBlock block={{...block,type:'paragraph'}} canEdit={canEdit} onChange={next=>onChange({...block,text:next.text})}/>{error?<p role="alert">{errorMessage(error)}</p>:null}</section>;
 if(resolution?.state==='deleted')return <aside aria-label="Deleted source">The source of this block was deleted.</aside>;
 if(resolution?.state==='trashed')return <aside aria-label="Trashed source">Source: {resolution.sourceTitle} (trashed)</aside>;
 if(resolution?.static)return <section aria-label="Static copy"><p className="text-ui text-ink-muted">Source: {resolution.sourceTitle}</p><ParagraphBlock block={{id:block.id,type:'paragraph',text:resolution.text as RichText}} canEdit={false} onChange={()=>{}}/></section>;
 if(resolution?.state!=='ready')return <aside aria-label="Access needed">Access needed to view this synced block.</aside>;
 const editable=canEdit&&!!resolution.canEdit&&!!page;
 return <section aria-label="Synced copy"><p className="text-ui text-ink-muted">Source: <a href={`/app/pages/${resolution.sourcePageId}`}>{resolution.sourceTitle}</a></p><ParagraphBlock block={{id:block.id,type:'paragraph',text:editable?text:resolution.text as RichText}} canEdit={editable} onChange={next=>{setText(next.text);setDirty(true);}} label="Synced paragraph"/>{editable?<button disabled={!dirty||saving} type="button" onClick={()=>void(async()=>{setSaving(true);setError(undefined);try{await mutate(`/api/pages/${page!.pageId}/synced/${block.id}`,{operationKey:operationKey(),expectedCopyRevisionId:block.copyRevisionId,expectedSourceRevisionId:base,text},'PATCH');setDirty(false);await actions?.onSyncedSaved?.();}catch(cause){setError(cause);}finally{setSaving(false);}})()}>{saving?'Saving synced block…':'Save synced block'}</button>:<p className="text-ui text-ink-muted">Read only. Editing requires edit access to both this page and its source.</p>}{dirty?<p role="status">Unsaved synced text. Save this block before leaving.</p>:null}{error?<p role="alert">{errorMessage(error)}</p>:null}</section>;
}
