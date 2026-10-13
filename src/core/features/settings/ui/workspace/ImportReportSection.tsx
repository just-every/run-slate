import {useState} from 'react';
export interface ImportReportItem {label?:string;detail?:string;code?:string;kind?:string;targetId?:string;reason?:string}
export function ImportReportSection({id,kind,label,initial,section}:{id:string;kind:string;label:string;initial:ImportReportItem[];section?:{count:number;pages:number}}) {
 const [page,setPage]=useState(0),[items,setItems]=useState(initial),[pending,setPending]=useState(false),[error,setError]=useState('');
 const total=section?.count??initial.length,pages=section?.pages??1;
 if(!total)return null;
 const load=async(next:number)=>{setPending(true);setError('');try{const response=await fetch(`/api/imports/${id}/report/${kind}?page=${next}`);if(!response.ok)throw new Error('Could not load the retained report.');const result=await response.json() as {items:ImportReportItem[]};setItems(result.items);setPage(next);}catch(error){setError(error instanceof Error?error.message:'Could not load report.');}finally{setPending(false);}};
 return <details open={kind==='unmapped'||kind==='conflicts'}><summary>{label} ({total})</summary>
  <ul>{items.map((item,index)=><li key={index}>{item.label??`${item.code}: ${item.kind} ${item.targetId}`}{item.detail||item.reason?` — ${item.detail??item.reason}`:''}</li>)}</ul>
  {!items.length&&section?<button type="button" disabled={pending} onClick={()=>void load(page)}>Load report page</button>:null}
  {pages>1?<nav aria-label={`${label} report pages`}><button type="button" disabled={pending||page===0} onClick={()=>void load(page-1)}>Previous</button><span>Page {page+1} of {pages}</span><button type="button" disabled={pending||page+1>=pages} onClick={()=>void load(page+1)}>Next</button></nav>:null}
  {error?<p role="alert">{error}</p>:null}
 </details>;
}
