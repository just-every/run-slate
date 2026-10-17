import { useState } from 'react';
import { useResource } from '../../../../client/useResource';
import { mutate, operationKey, errorMessage } from '../../../../client/transport';
import { RequestState } from '../../../../app/ui/RequestState';

export function GroupMentionSettings() {
  const resource=useResource<{restrictLargeGroups:boolean;sizeLimit:number;revisionId:string|null}>('/api/workspace/mention-configuration');
  const [pending,setPending]=useState(false),[error,setError]=useState<unknown>();
  return <section aria-label="Group mentions"><h3>Group mentions</h3><RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
    {resource.data?<><label><input type="checkbox" checked={resource.data.restrictLargeGroups} disabled={pending} onChange={async event=>{
      const restrictLargeGroups=event.target.checked;setPending(true);setError(undefined);
      try{await mutate('/api/workspace/mention-configuration',{operationKey:operationKey(),expectedRevisionId:resource.data!.revisionId,restrictLargeGroups},'PUT');await resource.reload();}
      catch(cause){setError(cause);}finally{setPending(false);}
    }}/>Only space administrators may mention groups larger than {resource.data.sizeLimit} people</label><p className="muted">Mentions notify only people who can read the page. Authors see the recipient count before sending.</p></>:null}
    </RequestState>{error?<p role="alert">{errorMessage(error)}</p>:null}</section>;
}
