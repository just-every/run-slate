import { useState } from 'react';
import type { HubPage } from '../types';

export function HubPagePicker({label,pages,selected,onChange,ordered=true}:{label:string;pages:HubPage[];selected:string[];onChange:(ids:string[])=>void;ordered?:boolean}) {
  const [query,setQuery]=useState('');
  const byId=new Map(pages.map(page=>[page.id,page]));
  function move(index:number,direction:number) {
    const next=[...selected];
    [next[index],next[index+direction]]=[next[index+direction]!,next[index]!];
    onChange(next);
  }
  return <fieldset className="hub-picker">
    <legend>{label}</legend>
    {selected.length ? <ol className="hub-selected">{selected.map((id,index)=><li key={id}>
      <span>{byId.get(id)?.title || 'Unavailable page'}</span>
      {ordered ? <><button type="button" disabled={index===0} aria-label={`Move ${byId.get(id)?.title||'page'} up`} onClick={()=>move(index,-1)}>↑</button><button type="button" disabled={index===selected.length-1} aria-label={`Move ${byId.get(id)?.title||'page'} down`} onClick={()=>move(index,1)}>↓</button></> : null}
      <button type="button" aria-label={`Remove ${byId.get(id)?.title||'page'}`} onClick={()=>onChange(selected.filter(value=>value!==id))}>Remove</button>
    </li>)}</ol> : <p className="muted">No pages selected.</p>}
    <label>Find {label.toLocaleLowerCase()}<input type="search" value={query} onChange={event=>setQuery(event.target.value)}/></label>
    <div className="hub-picker-options" role="group" aria-label={`Choose ${label.toLocaleLowerCase()}`}>
      {pages.filter(page=>!selected.includes(page.id)&&`${page.title} ${page.containerName}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(page=><label key={page.id}>
        <input type="checkbox" checked={false} disabled={selected.length>=20} onChange={()=>onChange([...selected,page.id])}/>
        <span>{page.title || 'Untitled'} <small>{page.containerName}{page.verified?' · Verified':''}</small></span>
      </label>)}
    </div>
    <p className="muted">{selected.length} of 20 selected.</p>
  </fieldset>;
}
