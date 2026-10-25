import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useWorkspace } from '../../../../app/ui/WorkspaceContext';
import { useResource } from '../../../../client/useResource';
import type { InlineSpan } from '../types';
import { request, errorMessage } from '../../../../client/transport';

export interface MentionPickerHandle { keyDown:(key:string)=>boolean }
interface Choice { key:string;label:string;span:InlineSpan;group?:boolean }
interface Props {
  onSelect:(span:InlineSpan)=>void;onClose:()=>void;query:string;pageId?:string;
  value:unknown;previous:unknown;anchor:{left:number;bottom:number};host:HTMLElement;
}

/** Suggestions keep the editable's caret; choosing a group confirms its readers once. */
export const MentionPicker=forwardRef<MentionPickerHandle,Props>(function MentionPicker({onSelect,onClose,query,pageId,value,previous,anchor,host},ref){
  const {navigation}=useWorkspace(),id=useId(),list=useRef<HTMLDivElement>(null);
  const people=useResource<{items:{id:string;displayName:string}[]}>(navigation.data?.isGuest?null:'/api/members');
  const pages=useResource<{items:{id:string;title:string}[]}>('/api/pages');
  const groups=useResource<{items:{id:string;name:string;size:number}[]}>(pageId?`/api/pages/${encodeURIComponent(pageId)}/mention-groups`:null);
  const [active,setActive]=useState(0),[preview,setPreview]=useState<{span:InlineSpan;count:number;excludedCount:number}|null>(null);
  const [pending,setPending]=useState(false),[error,setError]=useState<unknown>();
  const normalized=query.toLocaleLowerCase();
  const choice=(kind:'person'|'page'|'date'|'group',key:string,name:string,label:string):Choice=>({key:`${kind}:${key}`,label,span:{text:name,mention:{kind,id:key,label:name}},group:kind==='group'});
  const today=new Date(),tomorrow=new Date(today);tomorrow.setDate(today.getDate()+1);
  const localDay=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const dates=[choice('date',localDay(today),localDay(today),'Today · Date'),choice('date',localDay(tomorrow),localDay(tomorrow),'Tomorrow · Date')];
  if(/^\d{4}-\d{2}-\d{2}$/.test(query)&&!Number.isNaN(Date.parse(query)))dates.unshift(choice('date',query,query,`${query} · Date`));
  const choices:Choice[]=[
    ...(people.data?.items??[]).map(p=>choice('person',p.id,p.displayName,`${p.displayName} · Person`)),
    ...(groups.data?.items??[]).map(g=>choice('group',g.id,g.name,`${g.name} · Group · ${g.size} people`)),
    ...(pages.data?.items??[]).map(p=>choice('page',p.id,p.title,`${p.title} · Page`)),...dates,
  ].filter(item=>item.label.toLocaleLowerCase().includes(normalized));
  useEffect(()=>{setActive(0);setPreview(null);setError(undefined);},[query]);
  const index=Math.min(active,Math.max(0,choices.length-1));
  useEffect(()=>{list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'});},[index,query,preview]);
  async function choose(item:Choice){
    if(pending)return;
    if(!item.group){onSelect(item.span);onClose();return;}
    setPending(true);setError(undefined);
    try{const result=await request<{count:number;excludedCount:number}>(`/api/pages/${encodeURIComponent(pageId!)}/mention-preview`,{method:'POST',body:JSON.stringify({content:[value,item.span],previous})});setPreview({span:item.span,...result});}
    catch(cause){setError(cause);}finally{setPending(false);}
  }
  const confirm=()=>{if(preview){onSelect(preview.span);onClose();}};
  useImperativeHandle(ref,()=>({keyDown(key){
    if(key==='Escape'){onClose();return true;}
    if(key===' '&&!choices.length&&!preview){onClose();return false;}
    if(key==='ArrowDown'||key==='ArrowUp'){setActive(at=>(at+(key==='ArrowDown'?1:-1)+choices.length)%Math.max(1,choices.length));return true;}
    if(key==='Enter'||key==='Tab'){if(preview)confirm();else if(choices[index])void choose(choices[index]);else onClose();return true;}
    return false;
  }}));
  const width=Math.min(320,window.innerWidth-16),top=anchor.bottom+6;
  return createPortal(<div ref={list} id={id} className="mention-picker" role="listbox" aria-label="Insert mention" style={{left:Math.max(8,Math.min(anchor.left,window.innerWidth-width-8)),top,width,maxHeight:Math.max(44,Math.min(300,window.innerHeight-top-8))}} onMouseDown={event=>event.preventDefault()}>
    {!preview&&!error?choices.map((item,at)=><button key={item.key} id={`${id}-${at}`} role="option" aria-selected={index===at} tabIndex={-1} disabled={pending} type="button" onClick={()=>void choose(item)}>{item.label}</button>):null}
    {!choices.length&&(people.loading||pages.loading)&&!preview&&!error?<p role="status">Finding matches…</p>:null}
    {!choices.length&&!people.loading&&!pages.loading&&!preview&&!error?<p>No matches</p>:null}
    {people.error||pages.error||groups.error?<p role="alert">{errorMessage(people.error??pages.error??groups.error)}</p>:null}
    {pending?<p role="status">Checking recipients…</p>:null}
    {error?<p role="alert">{errorMessage(error)}</p>:null}
    {preview?<div aria-label="Group mention recipients"><strong>@{preview.span.mention?.label}</strong><p role="status">{preview.count} {preview.count===1?'person':'people'} will be notified</p>
      {preview.excludedCount?<p>{preview.excludedCount} {preview.excludedCount===1?'person cannot':'people cannot'} read this page and will not be notified. Share this page to include them, or cancel the mention.</p>:null}
      <button type="button" role="option" aria-selected="true" tabIndex={-1} onClick={confirm}>Mention readers</button>
    </div>:null}
    {preview||error?<button type="button" tabIndex={-1} onClick={onClose}>Cancel mention</button>:null}
  </div>,host);
});
