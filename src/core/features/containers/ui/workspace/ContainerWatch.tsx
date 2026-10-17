import { useState } from 'react';
import { useWorkspace } from '../../../../app/ui/WorkspaceContext';
import { useResource } from '../../../../client/useResource';
import { mutate, operationKey, errorMessage } from '../../../../client/transport';
import { RequestState } from '../../../../app/ui/RequestState';
export function ContainerWatch({id}:{id:string}) {
 const {navigation}=useWorkspace();
 const [pending,setPending]=useState(false),[error,setError]=useState<unknown>();
 const enabled=navigation.data?.containerWatches.includes(id)??false;
 return <span><button className="secondary-button" aria-pressed={enabled} disabled={pending||navigation.loading||!!navigation.error} onClick={async()=>{setPending(true);setError(undefined);try{await mutate('/api/navigation/container-watches',{operationKey:operationKey(),containerId:id,enabled:!enabled},'PUT');navigation.reload();}catch(cause){setError(cause);}finally{setPending(false);}}}>{enabled?'Stop watching space':'Watch space'}</button>{error?<span role="alert">{errorMessage(error)}</span>:null}</span>;
}
export function ContainerWatchers({id}:{id:string}) {
 const resource=useResource<{items:{id:string;displayName:string;watchingSince:string}[]}>(`/api/navigation/container-watches/${id}`);
 return <section><h4>Watching this space</h4><RequestState loading={resource.loading} error={resource.error} retry={resource.reload}><ul>{resource.data?.items.map(member=><li key={member.id}>{member.displayName}</li>)}</ul>{resource.data?.items.length===0?<p>No watchers yet.</p>:null}</RequestState></section>;
}
