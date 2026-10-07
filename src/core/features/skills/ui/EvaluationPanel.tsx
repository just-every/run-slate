import {useRef,useState} from 'react';
import {useResource} from '../../../client/useResource';
import {mutate,operationKey,errorMessage} from '../../../client/transport';
import {RequestState} from '../../../app/ui/RequestState';

type Status={skill_revision_id:string;cutoff:string;created_at:string;cases:{question:string}[];execution:{candidateRunId?:string;genericRunId?:string;expertRunId?:string;judgeRunId?:string;evaluationId?:string;criteria?:string[];candidateOwnerSeconds?:number|null;genericOwnerSeconds?:number|null}};
export function EvaluationPanel({skillId,revisionId,state,evaluations,canPrepare,reload}:{skillId:string;revisionId:string;state:string;evaluations:{id:string;state:string}[];canPrepare:boolean;reload:()=>void}){
 const [caseId,setCaseId]=useState(evaluations[0]?.id),[pending,setPending]=useState(false),[error,setError]=useState<unknown>();
 const prepareKey=useRef(operationKey());
 return <section className="detail-form" aria-label="Revision evaluation">
  <h5>Evaluation of this revision</h5>
  {evaluations.length ? <label>Frozen comparison <select style={{width:"100%",minWidth:0}} value={caseId} disabled={pending} onChange={event=>setCaseId(event.target.value)}>{evaluations.map(item=><option key={item.id} value={item.id}>{item.state} · {item.id}</option>)}</select></label>:null}
  {state==='draft'&&canPrepare&&!caseId?<button disabled={pending} onClick={async()=>{setPending(true);setError(undefined);try{const result=await mutate<{id:string}>(`/api/skills/${encodeURIComponent(skillId)}/prepare-evaluation`,{operationKey:prepareKey.current,revisionId});setCaseId(result.id);reload();}catch(cause){setError(cause);}finally{setPending(false);}}}>Evaluate selected draft</button>:null}
  {caseId?<Comparison key={caseId} id={caseId} revisionId={revisionId} reload={reload}/>:null}
  {error?<p role="alert">{errorMessage(error)}</p>:null}
 </section>;
}
function Comparison({id,revisionId,reload}:{id:string;revisionId:string;reload:()=>void}){
 const resource=useResource<Status>(`/api/skills/evaluations/${encodeURIComponent(id)}`);
 const [pending,setPending]=useState(false),[error,setError]=useState<unknown>(),[result,setResult]=useState<string>();
 const [candidate,setCandidate]=useState(''),[generic,setGeneric]=useState('');
 const attentionKey=useRef(operationKey()),baselineKey=useRef(operationKey());
 async function submit(path:string,input:unknown){setPending(true);setError(undefined);try{const result=await mutate<{state?:string;passed?:boolean}>(`/api/skills/evaluations/${encodeURIComponent(id)}${path}`,input);setResult(result.state?`${result.state}${result.passed===undefined?'':result.passed?' · passed':' · failed'}`:'Recorded');await resource.reload();reload();}catch(cause){setError(cause);}finally{setPending(false);}}
 const data=resource.data;
 return <RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
  {data&&data.skill_revision_id===revisionId?<>
   <p>Frozen question: {data.cases[0]?.question}</p><p>Evidence cutoff: {data.cutoff}</p>
   <ul>{data.execution.criteria?.map(criterion=><li key={criterion}>{criterion}</li>)}</ul>
   <p>Candidate run: {data.execution.candidateRunId??'Pending'}<br/>Generic run: {data.execution.genericRunId??'Pending'}<br/>Independent baseline: {data.execution.expertRunId??'Required'}<br/>Outcome assessment: {data.execution.judgeRunId??'Pending'}</p>
   {data.execution.evaluationId?<p>Retained evaluation: {data.execution.evaluationId}</p>:<>
    {data.execution.candidateOwnerSeconds!=null&&data.execution.genericOwnerSeconds!=null?<p>Observed attention: candidate {data.execution.candidateOwnerSeconds} seconds; generic {data.execution.genericOwnerSeconds} seconds.</p>:<form className="detail-form" onSubmit={event=>{event.preventDefault();void submit('/attention',{operationKey:attentionKey.current,candidateOwnerSeconds:Number(candidate),genericOwnerSeconds:Number(generic)});}}>
     <label>Observed candidate attention (seconds)<input required type="number" min="0" step="any" value={candidate} onChange={event=>setCandidate(event.target.value)} /></label>
     <label>Observed generic attention (seconds)<input required type="number" min="0" step="any" value={generic} onChange={event=>setGeneric(event.target.value)} /></label>
     <button disabled={pending||data.execution.candidateOwnerSeconds!=null}>Record observed attention</button>
    </form>}
    {!data.execution.expertRunId?<form className="detail-form" onSubmit={event=>{event.preventDefault();const fields=new FormData(event.currentTarget);void submit('/baseline',{operationKey:baselineKey.current,result:fields.get('result'),method:fields.get('method'),startedAt:new Date(String(fields.get('startedAt'))).toISOString(),ownerSeconds:Number(fields.get('ownerSeconds')),toolCostMicros:Number(fields.get('toolCostMicros'))});}}>
     <p>Independently perform the same question using the frozen sources, then record the actual result and costs.</p>
     <label>Independent result<textarea name="result" required /></label>
     <label>Method and tools<textarea name="method" required /></label>
     <label>Baseline started at<input name="startedAt" type="datetime-local" required /></label>
     <label>Observed baseline attention (seconds)<input name="ownerSeconds" type="number" min="0" step="any" required /></label>
     <label>Baseline tool cost (micros)<input name="toolCostMicros" type="number" min="0" step="1" required /></label>
     <button disabled={pending}>Record independent baseline</button>
    </form>:null}
    <button disabled={pending} onClick={()=>void submit('/complete',{})}>Check comparison and assess outcomes</button>
   </>}
   <button disabled={pending} onClick={()=>{void resource.reload();reload();}}>Refresh evaluation progress</button>
   {result?<p role="status">{result}</p>:null}
   {error?<p role="alert">{errorMessage(error)}</p>:null}
  </>:null}
 </RequestState>;
}
