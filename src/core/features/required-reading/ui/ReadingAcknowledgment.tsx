import {useState} from 'react';
import {mutate,operationKey,errorMessage} from '../../../client/transport';
import {useResource} from '../../../client/useResource';
import {displayDate} from '../../../app/ui/displayDate';
export function ReadingAcknowledgment({readingId}:{readingId:string}){
 const own=useResource<{acknowledgedAt:string|null}>(`/api/required-reading/${encodeURIComponent(readingId)}`);
 const [committedAt,setAcknowledgedAt]=useState<string>();
 const acknowledgedAt=committedAt??own.data?.acknowledgedAt;
 const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>();
 const [key]=useState(operationKey);
 return <div>{acknowledgedAt?<p role="status">Acknowledged · {displayDate(acknowledgedAt,true)}</p>:<button type="button" disabled={busy} onClick={async()=>{setBusy(true);setError(undefined);try{const result=await mutate<{value:{acknowledgedAt:string}}>(`/api/required-reading/${encodeURIComponent(readingId)}/acknowledge`,{operationKey:key});setAcknowledgedAt(result.value.acknowledgedAt);}catch(cause){setError(cause);}finally{setBusy(false);}}}>{busy?'Acknowledging…':'Acknowledge reading'}</button>}{error?<p role="alert">{errorMessage(error)}</p>:null}</div>;
}
