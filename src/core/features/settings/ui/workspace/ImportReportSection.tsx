import {useState} from 'react';
import {request,errorMessage} from '../../../../client/transport';
export interface ImportReportItem {label?:string;detail?:string;code?:string;kind?:string;targetId?:string;reason?:string}
export function ImportReportSection({id,kind,label,initial,section}:{id:string;kind:string;label:string;initial:ImportReportItem[];section?:{count:number;pages:number}}) {
 const [loaded,setLoaded]=useState<{page:number;items:ImportReportItem[]}>(),[pending,setPending]=useState(false),[error,setError]=useState('');
 const page=loaded?.page??0,items=loaded?.items??initial;
 const total=section?.count??initial.length,pages=section?.pages??1;
 if(!total)return null;
 const load=async(next:number)=>{setPending(true);setError('');try{const result=await request<{items:ImportReportItem[]}>(`/api/imports/${id}/report/${kind}?page=${next}`);if(!result.items.length)throw new Error('The retained report page is empty. Try loading it again.');setLoaded({items:result.items,page:next});}catch(error){setError(errorMessage(error));}finally{setPending(false);}};
 return <details className="import-report-section" open={kind==='unmapped'||kind==='conflicts'} onToggle={event=>{if(event.currentTarget.open&&!items.length&&section&&!pending&&!error)void load(page);}}><summary>{label} ({total})</summary>
  {items.length?<ul>{items.map((item,index)=><li key={index}>{item.label??`${item.code}: ${item.kind} ${item.targetId}`}{item.detail||item.reason?` — ${item.detail??item.reason}`:''}</li>)}</ul>:null}
  {pending?<p role="status">Loading report entries…</p>:null}
  {!items.length&&section&&error?<button className="secondary-button" type="button" disabled={pending} onClick={()=>void load(page)}>Load report page</button>:null}
  {pages>1?<nav aria-label={`${label} report pages`}><button type="button" disabled={pending||page===0} onClick={()=>void load(page-1)}>Previous</button><span>Page {page+1} of {pages}</span><button type="button" disabled={pending||page+1>=pages} onClick={()=>void load(page+1)}>Next</button></nav>:null}
  {error?<p role="alert">{error}</p>:null}
 </details>;
}
