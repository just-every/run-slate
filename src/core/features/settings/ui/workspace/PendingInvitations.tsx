import { useState } from 'react';
import type { Resource } from '../../../../client/useResource';
import { mutate, operationKey, errorMessage } from '../../../../client/transport';
import { RequestState } from '../../../../app/ui/RequestState';
import { displayDate } from '../../../../app/ui/displayDate';
export type PendingInvitation = { id:string;email:string;role:'member'|'guest';expiresAt:string };
export function PendingInvitations({resource}:{resource:Resource<{items:PendingInvitation[]}>}) {
  const [error,setError]=useState<unknown>();
  const [revoking,setRevoking]=useState<string>();
  return <section aria-label="Pending invitations"><h3>Pending invitations</h3>
    <RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
      {resource.data?.items.length?<ul className="settings-list">{resource.data.items.map(invitation=><li key={invitation.id}>
        <div><strong>{invitation.email}</strong><p>{invitation.role==='guest'?'Guest':'Member'} · Expires <time dateTime={invitation.expiresAt}>{displayDate(invitation.expiresAt)}</time></p></div>
        <button type="button" disabled={revoking===invitation.id} onClick={async()=>{setRevoking(invitation.id);setError(undefined);try{await mutate('/api/invitations/revoke',{operationKey:operationKey(),id:invitation.id});await resource.reload();}catch(cause){setError(cause);}finally{setRevoking(undefined);}}}>Revoke</button>
      </li>)}</ul>:<p>No pending invitations.</p>}
    </RequestState>{error?<p role="alert">{errorMessage(error)}</p>:null}
  </section>;
}
