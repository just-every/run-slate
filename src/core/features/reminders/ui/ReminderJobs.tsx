import {useState} from 'react';
import {useResource} from '../../../client/useResource';
import {mutate,operationKey,errorMessage} from '../../../client/transport';
import {RequestState} from '../../../app/ui/RequestState';
import {Button} from '../../../ui';
interface Job{id:string;title:string;href:string|null;dueAt:string;state:string;failure:string|null;stuck:boolean;revisionId:string}
export function ReminderJobs(){
 const resource=useResource<{items:Job[]}>('/api/reminders/jobs'),[error,setError]=useState<unknown>(),[busy,setBusy]=useState<string>();
 const jobs=resource.data?.items.filter(j=>!['delivered','stopped'].includes(j.state))??[];
 async function act(job:Job,retry:boolean){setBusy(job.id);setError(undefined);try{await mutate(`/api/reminders/${job.id}${retry?'/retry':''}`,{operationKey:operationKey(),...(retry?{expectedRevisionId:job.revisionId}:{})},retry?'POST':'DELETE');await resource.reload();}catch(e){setError(e);}finally{setBusy(undefined);}}
 return <section aria-label="Reminder follow-through"><h2>Reminder follow-through</h2><RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
 {jobs.length?<ul className="outcome-list">{jobs.sort((a,b)=>Number(!!b.failure||b.stuck)-Number(!!a.failure||a.stuck)).map(job=><li key={job.id}><div className="detail-form"><h3>{job.href?<a href={job.href}>{job.title}</a>:job.title}</h3><p>{job.failure?'Delivery failed. Retry or stop this reminder.':job.stuck?'Delivery interrupted. It will resume on the next scheduled run.':job.state==='running'?'Checking access and preparing delivery.':job.state==='queued-delivery'?'Queued for delivery':'Queued'} · Due {new Date(job.dueAt).toLocaleString()}</p><div className="flex flex-wrap gap-2">{job.failure||job.stuck?<Button size="sm" disabled={!!busy} onClick={()=>void act(job,true)}>Retry reminder</Button>:null}<Button size="sm" variant="secondary" disabled={!!busy} onClick={()=>void act(job,false)}>Stop reminder</Button></div></div></li>)}</ul>:<p>No reminders need follow-through.</p>}
 </RequestState>{error?<p role="alert">{errorMessage(error)}</p>:null}</section>;
}
