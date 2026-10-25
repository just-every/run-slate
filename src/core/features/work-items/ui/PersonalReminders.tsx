import { shortDate } from "../../../app/ui/displayDate";
import { useEffect, useState } from 'react';
import { useResource } from '../../../client/useResource';
import { mutate, operationKey, errorMessage } from '../../../client/transport';
import { RequestState } from '../../../app/ui/RequestState';
interface Reminder {id:string;pageId:string;blockId:string|null;date:string;time:string;timezone:string;offsetMinutes:number;deliveredAt:string|null;cancelledAt:string|null}
export function PersonalReminders() {
  const resource=useResource<{items:Reminder[]}>('/api/reminders');
  const [error,setError]=useState<unknown>();
  useEffect(()=>{const reload=()=>void resource.reload();window.addEventListener('slate:reminders-changed',reload);return()=>window.removeEventListener('slate:reminders-changed',reload);},[resource.reload]);
  return <section className="today-section"><h2>Your reminders</h2><RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
    <ul className="reminder-list">{resource.data?.items.filter(item=>!item.cancelledAt&&!item.deliveredAt).map(item=><li key={item.id}><a href={`/app/pages/${item.pageId}${item.blockId?`#block-${item.blockId}`:''}`}>{shortDate(`${item.date}T00:00:00`)} · {item.time} · {item.timezone}{item.offsetMinutes?` · ${item.offsetMinutes/60} hours before`:''}</a><button type="button" onClick={()=>void mutate(`/api/reminders/${item.id}`,{operationKey:operationKey()},'DELETE').then(resource.reload).catch(setError)}>Cancel reminder</button></li>)}</ul>
    {resource.data?.items.filter(item=>!item.cancelledAt&&!item.deliveredAt).length===0?<p className="muted">Set a reminder from a page’s More menu or a task.</p>:null}
  </RequestState>{error?<p role="alert">{errorMessage(error)}</p>:null}</section>;
}
