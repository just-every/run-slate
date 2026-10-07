import {useState} from 'react';
import {useResource} from '../../../../client/useResource';
import {RequestState} from '../../../../app/ui/RequestState';
import type {InlineSpan} from '../types';
export function MentionPicker({onSelect,onClose}:{onSelect:(span:InlineSpan)=>void;onClose:()=>void}){
  const [query,setQuery]=useState('');
  const people=useResource<{items:{id:string;displayName:string}[]}>('/api/members');
  const pages=useResource<{items:{id:string;title:string}[]}>('/api/pages');
  const choose=(kind:'person'|'page'|'date',id:string,label:string)=>{onSelect({text:label,mention:{kind,id,label}});onClose();};
  return <div className="mention-picker" role="dialog" aria-label="Insert mention" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();onClose();}}}>
    <label>Find a person or page<input autoFocus value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <RequestState loading={people.loading||pages.loading} error={pages.error} retry={pages.reload}>
      {people.data?.items.filter(p=>p.displayName.toLowerCase().includes(query.toLowerCase())).map(p=><button type="button" key={p.id} onClick={()=>choose('person',p.id,p.displayName)}>{p.displayName} · Person</button>)}
      {pages.data?.items.filter(p=>p.title.toLowerCase().includes(query.toLowerCase())).map(p=><button type="button" key={p.id} onClick={()=>choose('page',p.id,p.title)}>{p.title} · Page</button>)}
      <label>Date<input type="date" onChange={e=>{if(e.target.value)choose('date',e.target.value,e.target.value);}}/></label>
    </RequestState><button type="button" onClick={onClose}>Cancel mention</button>
  </div>;
}
