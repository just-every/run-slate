import {useEffect,useRef,useState} from 'react';
import type {TreePage} from '../../../../app/ui/PageTree';
import {useWorkspace} from '../../../../app/ui/WorkspaceContext';
import {useResource} from '../../../../client/useResource';
import {errorMessage,mutate,operationKey} from '../../../../client/transport';
import {ActionDialog} from '../../../../app/ui/ActionDialog';

type BulkResult={id:string;success:boolean;title?:string;message?:string};
type AccessChange={pageId:string;memberId:string|null;audience?:'public-link';before:string|null;after:string|null};
type MovePreview={accessPreviewHash:string;changes:AccessChange[]}|{message:string};
const accessLabel=(level:string|null)=>level?({full:'Full access',edit:'Can edit',comment:'Can comment',view:'Can view'}[level]??level):'No access';
export function ContainerBulk({pages,onSaved,statusOnly=false,containerId}:{pages:TreePage[];onSaved:()=>void;statusOnly?:boolean;containerId?:string}){
 const {member}=useWorkspace();
 const key=useRef(operationKey());
 const storageKey=containerId?`slate:bulk-failures:${member.id}:${containerId}`:null;
 const [selected,setSelected]=useState<string[]>([]),[action,setAction]=useState(''),[results,setResults]=useState<BulkResult[]>([]);
 const members=useResource<{items:{id:string;displayName:string}[]}>('/api/members');
 const statuses=useResource<{items:{key:string;label:string;requiresVerification:boolean;retiredAt:string|null}[]}>('/api/status');
 const containers=useResource<{items:{id:string;name:string}[]}>('/api/containers');
 const [destination,setDestination]=useState(''),[previews,setPreviews]=useState<Record<string,MovePreview>>({}),[previewing,setPreviewing]=useState(false);
 useEffect(()=>{
  if(!storageKey)return;
  try {
   const ids:unknown=JSON.parse(sessionStorage.getItem(storageKey)??'[]');
   // Persist identifiers only. Reload resolves names from the current readable listing.
   if(Array.isArray(ids))setResults(ids.filter((id):id is string=>typeof id==='string').map(id=>({id,success:false,message:'Not saved. Review this page before retrying.'})));
  } catch { /* A disabled browser store must not prevent a bulk change. */ }
 },[storageKey]);
 return <section className="space-bulk"><h3>Bulk tools</h3><p>Select pages. Each is checked independently; failures remain listed.</p><ul className="bulk-page-list">{pages.map(p=><li key={p.id}><label><input type="checkbox" checked={selected.includes(p.id)} onChange={e=>setSelected(e.target.checked?[...selected,p.id]:selected.filter(id=>id!==p.id))}/>{p.title}</label></li>)}</ul>
 <div className="action-row">{(statusOnly?['status']:['archive','trash','move','owner','status']).map(value=><button className="secondary-button" key={value} disabled={!selected.length} onClick={()=>{key.current=operationKey();setAction(value);setPreviews({});}}>{value==='owner'?'Change owner':value==='status'?'Change status':value[0].toUpperCase()+value.slice(1)}</button>)}</div>
 {results.length?<ul aria-label="Bulk results">{results.map(r=><li key={r.id}>{pages.find(p=>p.id===r.id)?.title??r.title??'Unavailable page'}: {r.success?'Saved':r.message}</li>)}</ul>:null}
 {action?<ActionDialog title={`${action} ${selected.length} selected pages`} action="Apply to selected pages" submitDisabled={previewing} onClose={()=>setAction('')} onSubmit={async data=>{
 if(action==='move'&&selected.some(id=>!previews[id]))throw Error('Preview access changes before moving.');
 const submitted=pages.filter(p=>selected.includes(p.id));
 const result=await mutate<{items:BulkResult[]}>('/api/pages/bulk',{operationKey:key.current,action,pages:submitted.map(p=>({id:p.id,expectedRevisionId:p.revisionId})),...(action==='owner'?{ownerMemberId:String(data.get('owner'))||null}:{}),...(action==='status'?{statusKey:String(data.get('status'))||null}:{}),...(action==='move'?{containerId:destination,accessPreviewHashes:Object.fromEntries(Object.entries(previews).flatMap(([id,p])=>'accessPreviewHash' in p?[[id,p.accessPreviewHash]]:[]))}:{})});
 setResults(result.items.map(r=>({...r,title:submitted.find(p=>p.id===r.id)?.title})));
 const failures=result.items.filter(r=>!r.success).map(r=>r.id);
 if(storageKey)try{sessionStorage.setItem(storageKey,JSON.stringify(failures));}catch{ /* Results remain available in this view. */ }
 setSelected(failures);onSaved();
 }}>{action==='owner'?<label>New owner<select name="owner"><option value="">Unassigned</option>{members.data?.items.map(m=><option key={m.id} value={m.id}>{m.displayName}</option>)}</select></label>:action==='status'?<label>New status<select name="status"><option value="">Clear status</option>{statuses.data?.items.filter(s=>!s.requiresVerification&&!s.retiredAt).map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select></label>:action==='move'?<><label>Destination space<select value={destination} disabled={previewing} onChange={e=>{setDestination(e.target.value);setPreviews({});}}><option value="">Choose a space</option>{containers.data?.items.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button className="secondary-button" type="button" disabled={!destination||previewing} onClick={async()=>{
 setPreviewing(true);
 const next:typeof previews={};
 try {
  for(const id of selected){
   try{next[id]=await mutate(`/api/pages/${id}/move-preview`,{containerId:destination,parentPageId:null});}
   catch(cause){next[id]={message:errorMessage(cause)};}
  }
  setPreviews(next);
 }finally{setPreviewing(false);}
 }}>{previewing?'Previewing…':'Preview access changes'}</button>{Object.entries(previews).map(([id,p])=><details key={id} open={'message' in p}><summary>{pages.find(r=>r.id===id)?.title}</summary>{'accessPreviewHash' in p?(p.changes.length?<ul>{p.changes.map((change,index)=><li key={index}>{pages.find(page=>page.id===change.pageId)?.title??'Page'} — {change.memberId?(members.data?.items.find(member=>member.id===change.memberId)?.displayName??'Workspace member'):change.audience==='public-link'?'Public link':'Anonymous visitors'}: {accessLabel(change.before)} → {accessLabel(change.after)}</li>)}</ul>:<p>No access changes.</p>):<p role="status">{p.message}</p>}</details>)}</>:<p>This changes each selected page and its descendants. Their histories remain available.</p>}</ActionDialog>:null}
 </section>;
}
