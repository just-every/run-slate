import {useEffect,useState} from 'react';
import {useResource} from '../../../client/useResource';
import {mutate,operationKey} from '../../../client/transport';
import {RequestState} from '../../../app/ui/RequestState';
import {ActionDialog} from '../../../app/ui/ActionDialog';
import {DecisionCard,type Decision} from './PageDecisions';
import {TopBar} from '../../../app/ui/header/TopBar';
import {PageTitle} from '../../../app/ui/header/PageTitle';

export function DecisionWorkspace({id}:{id?:string}) {
 const [filters,setFilters]=useState('');
 const revision=typeof window==='undefined'?null:new URLSearchParams(window.location.search).get('revision');
 const resource=useResource<{items:Decision[]}>('/api/decisions?'+filters);
 const selected=useResource<Decision>(id?`/api/decisions/${id}${revision?`?revision=${encodeURIComponent(revision)}`:''}`:null);
 const members=useResource<{items:{id:string;displayName:string}[]}>('/api/members');
 const spaces=useResource<{items:{id:string;name:string}[]}>('/api/containers');
 const [remove,setRemove]=useState(false);
 return <><TopBar trail={id?[{label:'Decisions',href:'/app/decisions'},{label:'Decision'}]:[{label:'Decisions'}]}/><section className="main"><PageTitle>Decisions</PageTitle>
 {id?<><a href="/app/decisions">All decisions</a><RequestState loading={selected.loading} error={selected.error} retry={selected.reload}>{selected.data?<>
 {revision?<p role="status">Exact retained decision revision: {revision}</p>:null}
 {selected.data.revision?<p>{selected.data.revision.kind} · {new Date(selected.data.revision.createdAt).toLocaleString()} · {members.data?.items.find(member=>member.id===selected.data!.revision!.actorId)?.displayName??selected.data.revision.actorId}</p>:null}
 {selected.data.removed_at?<p>Removed from the active page on {new Date(selected.data.removed_at).toLocaleString()}. Its retained history remains available.</p>:null}
 <a href={`/app/pages/${selected.data.page_id}`}>Open underlying page</a>
 {selected.data.acceptedRevisionHref?<a href={selected.data.acceptedRevisionHref}>Open accepted revision</a>:null}
 <DecisionCard decision={selected.data} siblings={resource.data?.items??[]} readOnly={!!revision||!!selected.data.removed_at} reload={selected.reload}/>
 {!revision&&!selected.data.removed_at?<button onClick={()=>setRemove(true)}>Remove decision layer</button>:null}
 <DecisionHistory revision={selected.data.revision_id} id={id}/>
 {remove?<ActionDialog title="Remove decision layer?" action="Remove decision" onClose={()=>setRemove(false)} onSubmit={async()=>{await mutate(`/api/decisions/${id}/remove`,{operationKey:operationKey(),expectedRevisionId:selected.data!.revision_id});selected.reload();resource.reload();}}><p>The underlying page stays intact. The decision leaves active lists; its revisions and reviews remain available here.</p></ActionDialog>:null}
 </>:null}</RequestState></>:<>
 <form className="detail-form" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);setFilters(new URLSearchParams([...data].filter(([,value])=>!!value).map(([key,value])=>[key,String(value)])).toString());}}>
 <label>State<select name="state"><option value="">All states</option>{['proposed','accepted','superseded'].map(state=><option key={state}>{state}</option>)}</select></label>
 <label>Owner<select name="ownerId"><option value="">All owners</option>{members.data?.items.map(item=><option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
 <label>Space<select name="containerId"><option value="">All accessible spaces</option>{spaces.data?.items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
 {['decidedFrom','decidedTo','reviewFrom','reviewTo'].map((name,index)=><label key={name}>{['Decided from','Decided until','Review from','Review until'][index]}<input type="date" name={name}/></label>)}
 <label>Evidence currency<select name="citationsCurrent"><option value="">Any evidence state</option><option value="true">Current</option><option value="false">Changed</option></select></label><button>Filter decisions</button></form>
 <RequestState loading={resource.loading} error={resource.error} retry={resource.reload}><ul className="settings-list">{resource.data?.items.map(item=><li key={item.id}><a href={item.acceptedRevisionHref??`/app/decisions/${item.id}`}><strong>{item.question}</strong><p>{item.state} · {item.citationsCurrent?'Current evidence':'Evidence changed'}{item.review_at?` · Review ${new Date(item.review_at).toLocaleDateString()}`:''}</p></a><a href={`/app/decisions/${item.id}`}>Current record</a></li>)}</ul>{resource.data?.items.length===0?<p>No decisions match these filters.</p>:null}</RequestState>
 </>}
 </section></>;
}
function DecisionHistory({id,revision}:{id:string;revision:string}){
 const history=useResource<{items:{id:string;entity_kind:string;actor_id:string;created_at:string}[]}>(`/api/decisions/${id}/history`);
 const members=useResource<{items:{id:string;displayName:string}[]}>('/api/members');
 const reviews=useResource<{items:{id:string;note:string;reviewed_by_member_id:string;created_at:string}[]}>(`/api/decisions/${id}/reviews`);
 useEffect(()=>{void history.reload();void reviews.reload();},[revision,history.reload,reviews.reload]);
 return <details><summary>Decision history and reviews</summary><RequestState loading={history.loading||reviews.loading} error={history.error??reviews.error} retry={()=>{history.reload();reviews.reload();}}><ul>{history.data?.items.map(item=><li key={item.id}><a href={`/app/decisions/${id}?revision=${item.id}`}>{item.entity_kind} · {new Date(item.created_at).toLocaleString()}</a> · {members.data?.items.find(member=>member.id===item.actor_id)?.displayName??item.actor_id}</li>)}</ul><h3>Recorded reviews</h3><ul>{reviews.data?.items.map(item=><li key={item.id}>{item.note} · {new Date(item.created_at).toLocaleString()} · {members.data?.items.find(member=>member.id===item.reviewed_by_member_id)?.displayName??item.reviewed_by_member_id}</li>)}</ul></RequestState></details>;
}
