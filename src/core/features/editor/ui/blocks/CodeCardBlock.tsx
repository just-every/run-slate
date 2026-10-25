import {useEffect,useRef,useState} from 'react';
import {Button} from '../../../../ui';
import {request} from '../../../../client/transport';
import {useWorkspace} from '../../../../app/ui/WorkspaceContext';
import {useTaskPage} from './TaskPageContext';
import type {LinkCardBlockData} from '../types';
import {codeReference,type CodeCardState} from '../../../code-embeds/reference';

const refreshPeriod=5*60*1000;
/** Reader metadata stays in this mounted view and never becomes block content. */
export function CodeCardBlock({block}:{block:LinkCardBlockData}){
 const page=useTaskPage(),{member}=useWorkspace(),element=useRef<HTMLElement>(null);
 const reference=codeReference(block.url)!;
 const label=reference.provider==='github'?'GitHub':'GitLab';
 const key=[member.id,page?.pageId,page?.revisionId,block.id,reference.url].join(':');
 const [result,setResult]=useState<{key:string;value:CodeCardState;checkedAt:string}>();
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{
  setResult(undefined);
  if(!page?.pageId||!page.revisionId)return;
  let alive=true,visible=false,lastAttempt=0,controller:AbortController|undefined;
  const load=async()=>{
   lastAttempt=performance.now();controller?.abort();
   const current=new AbortController();controller=current;setResult(undefined);
   let value:CodeCardState;
   try{
    value=await request<CodeCardState>(`/api/pages/${encodeURIComponent(page.pageId)}/code-cards/${encodeURIComponent(block.id)}`,{signal:current.signal,cache:'no-store'});
    if(value.state==='readable'&&(value.reference.url!==reference.url||value.reference.provider!==reference.provider))value={state:'failed'};
   }catch{value={state:'failed'};}
   if(alive&&!current.signal.aborted)setResult({key,value,checkedAt:new Date().toISOString()});
  };
  const refreshVisible=()=>{if(visible&&document.visibilityState==='visible')void load();};
  const observer=new IntersectionObserver(entries=>{
   visible=entries.some(entry=>entry.isIntersecting);
   if(visible&&document.visibilityState==='visible'&&performance.now()-lastAttempt>=refreshPeriod)void load();
  });
  if(element.current)observer.observe(element.current);
  void load();
  const timer=setInterval(()=>{if(performance.now()-lastAttempt>=refreshPeriod)refreshVisible();},refreshPeriod);
  const ended=()=>{controller?.abort();setResult(undefined);};
  document.addEventListener('visibilitychange',refreshVisible);
  window.addEventListener('slate:session-ended',ended);
  return()=>{alive=false;controller?.abort();observer.disconnect();clearInterval(timer);document.removeEventListener('visibilitychange',refreshVisible);window.removeEventListener('slate:session-ended',ended);};
 },[key,refresh]);
 const current=result?.key===key?result:undefined,value=current?.value;
 return <section ref={element} aria-label={`${label} code card`} className="my-2 min-w-0 rounded-card border border-line bg-surface p-3 text-small">
  <p className="text-small text-ink-muted">{label}</p>
  {value?.state==='readable'?<>
   <a href={reference.url} rel="noreferrer" target="_blank" className="block break-words text-ui font-medium text-accent underline">{value.metadata.title}</a>
   <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1"><strong className="capitalize">{value.metadata.state}</strong>{value.metadata.author?<span className="break-words">{value.metadata.author}</span>:null}{value.metadata.time?<time dateTime={value.metadata.time}>{new Date(value.metadata.time).toLocaleString()}</time>:null}</p>
   {value.metadata.checks.length?<ul aria-label="Checks" className="my-2 list-none p-0">{value.metadata.checks.map((check,index)=><li key={index} className="break-words">{check.name}: {check.state}</li>)}</ul>:null}
   {value.metadata.code?<>
    <p className="mt-2 break-all">Pinned to <code className="text-[13px]">{value.metadata.code.sha}</code></p>
    {value.metadata.code.changed?<p role="status" className="mt-2 break-all">Changed since {value.metadata.code.branch} at {value.metadata.code.head}. The pinned code is unchanged.</p>:null}
    <pre className="mt-2 max-w-full overflow-x-auto rounded-control bg-sidebar-hover p-2 text-[13px]"><code className="text-[13px]">{value.metadata.code.lines.map((line,index)=><span key={index} className="block"><span aria-hidden="true" className="mr-3 select-none text-ink-muted">{value.metadata.code!.first+index}</span>{line}</span>)}</code></pre>
   </>:null}
  </>:<>
   <a href={reference.url} rel="noreferrer" target="_blank" className="break-words text-accent underline">{label} link</a>
   {value?.state==='connect'?<p className="mt-2"><a href="/app/settings?section=portability#code-accounts" className="text-accent underline">Connect to view</a></p>:value?.state==='request-access'?<p className="mt-2"><a href={reference.url} rel="noreferrer" target="_blank" className="text-accent underline">Request access</a></p>:<p className="mt-2" role="status">{value?.state==='unavailable'?'Source unavailable.':value?.state==='failed'?'Code access could not be checked.':'Checking code access…'}</p>}
  </>}
  <div className="mt-2 flex flex-wrap items-center gap-2">
   <Button variant="ghost" size="sm" disabled={!page?.revisionId} onClick={()=>setRefresh(n=>n+1)}>Refresh card</Button>
   {current?<p className="text-small text-ink-muted" role="status">Last checked <time dateTime={current.checkedAt}>{new Date(current.checkedAt).toLocaleTimeString()}</time></p>:null}
  </div>
 </section>;
}
