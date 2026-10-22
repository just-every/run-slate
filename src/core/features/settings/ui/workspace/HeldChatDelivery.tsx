import {useState} from 'react';
import {useResource} from '../../../../client/useResource';
import {mutate,operationKey,errorMessage} from '../../../../client/transport';
import type {ChatConnection} from './ChatNotificationFields';

type HeldDelivery={id:string;createdAt:string;failure:string|null};
export function HeldChatDelivery({connection,onResolved}:{connection:ChatConnection;onResolved:()=>Promise<boolean>}) {
 const [open,setOpen]=useState(false);
 return <div>
  <p>Uncertain sends: {connection.heldCount}. Delivery is unconfirmed; Slate will not send them again.</p>
  {!open?<button onClick={()=>setOpen(true)}>Resolve held sends</button>:<HeldList connection={connection} onResolved={onResolved}/>}
 </div>;
}
function HeldList({connection,onResolved}:{connection:ChatConnection;onResolved:()=>Promise<boolean>}) {
 const history=useResource<{items:HeldDelivery[]}>(`/api/notifications/chat/destinations/${connection.id}/deliveries?held=true`);
 const [pending,setPending]=useState(false),[error,setError]=useState<unknown>();
 return <div>
  <p>Check the channel before acknowledging. Acknowledgment keeps the uncertain record and any unresolved withdrawal. It does not confirm delivery or resend the message.</p>
  {history.loading?<p>Loading held sends…</p>:null}
  {history.error?<p role="alert">{errorMessage(history.error)}</p>:null}
  {history.data?.items.map(item=><div key={item.id}>
   <p>Unconfirmed send from <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>{item.failure?` — ${item.failure}`:''}.</p>
   <button disabled={pending} onClick={async()=>{
    setPending(true);setError(undefined);
    try{
     await mutate(`/api/notifications/chat/destinations/${connection.id}/deliveries/${item.id}/acknowledge`,{operationKey:operationKey(),expectedRevisionId:connection.revisionId});
     await history.reload();await onResolved();
    }catch(cause){setError(cause);}finally{setPending(false);}
   }}>Acknowledge without resending</button>
  </div>)}
  {error?<p role="alert">{errorMessage(error)}</p>:null}
 </div>;
}
