import {useState} from 'react';
import {useWorkspace} from '../../../../app/ui/WorkspaceContext';
import {useResource} from '../../../../client/useResource';
import {RequestState} from '../../../../app/ui/RequestState';
import type {InlineSpan} from '../types';
import { request, errorMessage } from '../../../../client/transport';
export function MentionPicker({onSelect,onClose,onQueryChange,pageId,value,previous}:{onSelect:(span:InlineSpan)=>void;onClose:()=>void;onQueryChange:(query:string)=>void;pageId?:string;value:unknown;previous:unknown}){
  const [query,setQuery]=useState('');
  const {navigation}=useWorkspace();
  const people=useResource<{items:{id:string;displayName:string}[]}>(navigation.data?.isGuest ? null : '/api/members');
  const pages=useResource<{items:{id:string;title:string}[]}>('/api/pages');
  const groups=useResource<{items:{id:string;name:string;size:number}[]}>(pageId?`/api/pages/${encodeURIComponent(pageId)}/mention-groups`:null);
  const [preview,setPreview]=useState<{span:InlineSpan;count:number;excludedCount:number}|null>(null);
  const [pending,setPending]=useState(false),[error,setError]=useState<unknown>();
  const choose=(kind:'person'|'page'|'date',id:string,label:string)=>{onSelect({text:label,mention:{kind,id,label}});onClose();};
  return <div className="mention-picker" role="dialog" aria-label="Insert mention" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();onClose();}if(e.key==='Enter'&&e.target instanceof HTMLInputElement)e.preventDefault();}}>
    <label>Find a person, group or page<input autoFocus value={query} onChange={e=>{setQuery(e.target.value);onQueryChange(e.target.value);setPreview(null);setError(undefined);}}/></label>
    {!preview&&!error?<RequestState loading={people.loading||pages.loading} error={pages.error} retry={pages.reload}>
      {people.data?.items.filter(p=>p.displayName.toLowerCase().includes(query.toLowerCase())).map(p=><button type="button" key={p.id} onClick={()=>choose('person',p.id,p.displayName)}>{p.displayName} · Person</button>)}
      {groups.data?.items.filter(group=>group.name.toLowerCase().includes(query.toLowerCase())).map(group=><button type="button" key={group.id} disabled={pending} onClick={async()=>{
        const span:InlineSpan={text:group.name,mention:{kind:'group',id:group.id,label:group.name}};
        setPending(true);setPreview(null);setError(undefined);
        try {const result=await request<{count:number;excludedCount:number}>(`/api/pages/${encodeURIComponent(pageId!)}/mention-preview`,{method:'POST',body:JSON.stringify({content:[value,span],previous})});setPreview({span,...result});}
        catch(cause){setError(cause);}finally{setPending(false);}
      }}>{group.name} · Group · {group.size} people</button>)}
      {pages.data?.items.filter(p=>p.title.toLowerCase().includes(query.toLowerCase())).map(p=><button type="button" key={p.id} onClick={()=>choose('page',p.id,p.title)}>{p.title} · Page</button>)}
      <label>Date<input type="date" onChange={e=>{if(e.target.value)choose('date',e.target.value,e.target.value);}}/></label>
    </RequestState>:null}
    {groups.error?<p role="alert">{errorMessage(groups.error)}</p>:null}
    {pending?<p role="status">Checking recipients…</p>:null}
    {error?<p role="alert">{errorMessage(error)}</p>:null}
    {preview?<div aria-label="Group mention recipients"><strong>@{preview.span.mention?.label}</strong><p role="status">{preview.count} {preview.count===1?'person':'people'} will be notified</p>
      {preview.excludedCount?<p>{preview.excludedCount} {preview.excludedCount===1?'person cannot':'people cannot'} read this page and will not be notified. Share this page to include them, or cancel the mention.</p>:null}
      <button type="button" autoFocus onClick={()=>{onSelect(preview.span);onClose();}}>Mention readers</button>
    </div>:null}
    <button type="button" onClick={onClose}>Cancel mention</button>
  </div>;
}
