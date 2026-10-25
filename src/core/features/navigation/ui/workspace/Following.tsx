import { DateStamp } from "../../../../app/ui/displayDate";
import { notificationText } from "../../../notifications/ui/notificationText";
import { useState } from 'react';
import { useResource } from '../../../../client/useResource';
import { mutate, operationKey, errorMessage } from '../../../../client/transport';
import { RequestState } from '../../../../app/ui/RequestState';
interface Update {id:string;event:string;actor:{displayName:string}|null;title:string|null;href:string;createdAt:string;readAt:string|null}
export function Following({ excludedIds = [] }: { excludedIds?: string[] }) {
 const resource=useResource<{items:Update[]}>('/api/navigation/following');
 const items=resource.data?.items.filter(item=>!excludedIds.includes(item.id));
 const [error,setError]=useState<unknown>();
 return <section aria-label="Following"><h2>Following</h2><p className="muted">Updates from the pages and spaces you watch.</p>
  <RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
   <ul className="outcome-list">{items?.map(item=><li key={item.id} data-event={item.event}><a href={item.href} onClick={event=>{event.preventDefault();void mutate('/api/notifications/actions',{operationKey:operationKey(),action:'read',id:item.id}).then(()=>window.location.assign(item.href)).catch(setError);}}>
    <h3>{notificationText(item)}</h3>{!item.readAt?<span className="muted">Unread · </span>:null}<DateStamp value={item.createdAt} />
   </a></li>)}</ul>
   {items?.length===0?<p>No updates yet. Watch a page or space to follow its activity.</p>:null}
  </RequestState>{error?<p role="alert">{errorMessage(error)}</p>:null}
 </section>;
}
