import { useState } from 'react';
import { useWorkspace } from '../../../../app/ui/WorkspaceContext';
import { RequestState } from '../../../../app/ui/RequestState';
import { useResource } from '../../../../client/useResource';
import { mutate, operationKey, errorMessage } from '../../../../client/transport';
export function WatchDefaults({saved}:{saved:()=>void}) {
 const {member}=useWorkspace();
 return member.role==='owner'?<OwnerWatchDefaults saved={saved}/>:null;
}
function OwnerWatchDefaults({saved}:{saved:()=>void}) {
 const resource=useResource<{autowatch:boolean;revisionId:string|null}>('/api/navigation/watch-configuration');
 const [pending,setPending]=useState(false),[error,setError]=useState<unknown>();
 return <section><h3>Workspace watch default</h3><RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
 {resource.data?<label><input type="checkbox" checked={resource.data.autowatch} disabled={pending} onChange={async event=>{const autowatch=event.target.checked;setPending(true);setError(undefined);try{await mutate('/api/navigation/watch-configuration',{operationKey:operationKey(),expectedRevisionId:resource.data!.revisionId,autowatch},'PUT');resource.reload();saved();}catch(cause){setError(cause);}finally{setPending(false);}}}/>Automatically watch pages members create, edit or comment on</label>:null}
 <p className="muted">Each member can choose their own setting. Stopping a page watch keeps it off until they choose to watch again.</p>
 </RequestState>{error?<p role="alert">{errorMessage(error)}</p>:null}</section>;
}
