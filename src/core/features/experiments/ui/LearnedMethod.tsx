import {useRef,useState} from 'react';
import {mutate,operationKey} from '../../../client/transport';
export function LearnedMethod({id,revisionId}:{id:string;revisionId:string}){
 const key=useRef(operationKey()),[pending,setPending]=useState(false),[error,setError]=useState(''),[skill,setSkill]=useState<string>();
 return <div><p>The retained forecast, outcome and failed hypotheses can prepare a draft method. Evaluation and owner activation remain separate.</p>{skill?<p role="status">Draft method prepared. Open the page’s Procedures panel to evaluate it before activation.</p>:<button className="secondary-button" disabled={pending} onClick={async()=>{setPending(true);setError('');try{const result=await mutate<{value:{skillId:string}}>(`/api/experiments/${id}/learned-skill`,{operationKey:key.current,expectedRevisionId:revisionId});setSkill(result.value.skillId);}catch(e){setError(e instanceof Error?e.message:'Could not prepare the learned method.');}finally{setPending(false);}}}>{pending?'Preparing method…':'Prepare learned method'}</button>}{error?<p role="alert">{error}</p>:null}</div>;
}
