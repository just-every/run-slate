import {useState,useRef} from 'react';
import {useResource} from '../../../client/useResource';
import {mutate,operationKey,errorMessage} from '../../../client/transport';
interface Connection {id:string;provider:string;accountId:string;state:string;identity?:{targets:string[]}}
interface Proposal {expectedRevision:string;expectedAudienceRevision:string;audience:string[];sourceIds:string[];accountId:string;operation:string;content:Record<string,unknown>}
export function NativeEffectForm({runId,reload}:{runId:string;reload:()=>void}){
 const authorizationKey=useRef(operationKey());
 const connections=useResource<{items:Connection[]}>('/api/connectors');
 const member=useResource<{role:string}>('/api/members/current');
 const [connectionId,setConnection]=useState(''),[target,setTarget]=useState(''),[recordTarget,setRecordTarget]=useState(''),[proposal,setProposal]=useState<Proposal>(),[input,setInput]=useState<Record<string,unknown>>(),[effect,setEffect]=useState<{effectId:string;state:string}>(),[pending,setPending]=useState(false),[error,setError]=useState<unknown>();
 const connection=connections.data?.items.find(item=>item.id===connectionId),article=connection?.provider==='happytohelp';
 const eligible=connections.data?.items.filter(item=>item.state==='connected'&&['happytohelp','orbit'].includes(item.provider))??[];
 if(member.data?.role!=='owner')return null;
 async function preview(form:HTMLFormElement){setPending(true);setError(undefined);try{const values=new FormData(form),text=(name:string)=>String(values.get(name)??'');const content=article?{title:text('title'),content:text('content'),summary:text('summary'),status:text('status')}:{title:text('title'),description:text('content'),assigneeId:text('assigneeId')||null,dueAt:text('dueAt')?new Date(text('dueAt')).toISOString():null,status:text('status')};const body={runId,connectionId,target,content};const result=await mutate<Proposal>('/api/effects/native/preview',body);setInput(body);setProposal(result);authorizationKey.current=operationKey();}catch(cause){setError(cause);}finally{setPending(false);}}
 async function authorize(){if(!proposal||!input)return;setPending(true);setError(undefined);try{const result=await mutate<{effectId:string;state:string}>('/api/effects/native/authorize',{...input,operationKey:authorizationKey.current,expectedRevision:proposal.expectedRevision,expectedAudienceRevision:proposal.expectedAudienceRevision,expiresAt:new Date(Date.now()+3600000).toISOString()});setEffect(result);reload();}catch(cause){setError(cause);}finally{setPending(false);}}
 async function dispatch(){if(!effect)return;setPending(true);setError(undefined);try{const result=await mutate<{state:string}>(`/api/effects/${effect.effectId}/${['uncertain','dispatched'].includes(effect.state)?'reconcile':'dispatch'}`,{});setEffect({...effect,state:result.state});reload();}catch(cause){setEffect({...effect,state:'uncertain'});setError(cause);}finally{setPending(false);}}
 return <details className="finding native-effect"><summary>Prepare a connected source change</summary>
 <p>Review one exact article correction or CRM handoff. The source connection and your separate Slate permission must both remain valid.</p>
 {!eligible.length?<p>Connect the specific HappyToHelp article or Orbit record in workspace settings first.</p>:null}
 {!proposal?<form className="detail-form" onSubmit={event=>{event.preventDefault();void preview(event.currentTarget);}}>
 <label>Connected account<select required value={connectionId} onChange={event=>{setConnection(event.target.value);setTarget('');setRecordTarget('');}}><option value="">Choose an account</option>{eligible.map(item=><option key={item.id} value={item.id}>{item.provider} · {item.accountId}</option>)}</select></label>
 <label>Source record<select required value={recordTarget} onChange={event=>{const value=event.target.value;setRecordTarget(value);setTarget(!article&&/^opportunities\/[^/]+$/.test(value)?value+'/handoffs/'+crypto.randomUUID():value);}}><option value="">Choose the exact record</option>{connection?.identity?.targets.filter(value=>article?value.includes('/articles/'):/^opportunities\/[^/]+(?:\/handoffs\/[^/]+)?$/.test(value)).map(value=><option key={value}>{value}</option>)}</select></label>
 <label>Title<input name="title" required /></label>
 <label>{article?'Article content':'Handoff description'}<textarea name="content" required /></label>
 {article?<label>Summary<textarea name="summary" /></label>:<><label>Assignee identifier<input name="assigneeId" /></label><label>Due date<input name="dueAt" type="datetime-local" /></label></>}
 <label>Status<select name="status" key={String(article)}>{(article?['draft','published']:['open','completed','cancelled']).map(status=><option key={status}>{status}</option>)}</select></label>
 <button className="primary-button" disabled={pending||!target}>{pending?'Checking source…':'Review exact change'}</button></form>:<>
 <h4>Review this change</h4><dl className="native-effect-details"><div><dt>Operation</dt><dd>{proposal.operation}</dd></div><div><dt>Account</dt><dd>{proposal.accountId}</dd></div><div><dt>Source record</dt><dd>{target}</dd></div></dl>
 <dl className="native-effect-details">{Object.entries(proposal.content).map(([key,value])=><div key={key}><dt>{({title:'Title',content:'Article content',summary:'Summary',status:'Status',description:'Handoff description',assigneeId:'Assignee',dueAt:'Due date'} as Record<string,string>)[key]??key}</dt><dd style={{whiteSpace:'pre-wrap'}}>{value===null?'Not set':String(value)}</dd></div>)}</dl>
 <p>{proposal.sourceIds.length} evidence source{proposal.sourceIds.length===1?'':'s'} · {proposal.audience.includes('public')?'Public audience':'Verified source audience'} · no charge</p>
 <details><summary>Source and audience revisions</summary><p>{proposal.expectedRevision}</p><p>{proposal.expectedAudienceRevision}</p></details>
 {!effect?<><p>Authorize only this content, record and audience for one hour. This does not send the change.</p><div className="native-effect-actions"><button className="primary-button" disabled={pending} onClick={()=>void authorize()}>Authorize this exact change</button><button className="native-effect-adjust" disabled={pending} onClick={()=>{setProposal(undefined);setInput(undefined);}}>Adjust</button></div></>:<>
 <p role="status">{effect.state==='confirmed'?'Confirmed by the owning system':effect.state==='prepared'?'Authorized and ready; source is unchanged':effect.state==='uncertain'?'Confirmation is unknown. Reconcile before any further work.':effect.state}</p>
 {['prepared','uncertain','dispatched'].includes(effect.state)?<button className="primary-button" disabled={pending} onClick={()=>void dispatch()}>{effect.state==='prepared'?'Apply authorized change':'Check original receipt'}</button>:null}
 </>}
 </>}
 {error?<p role="alert">{errorMessage(error)}</p>:null}
 </details>;
}
