import { DateStamp } from "../../../../app/ui/displayDate";
import { useState } from 'react';
import { useResource } from '../../../../client/useResource';
import { mutate, operationKey, errorMessage } from '../../../../client/transport';
import { RequestState } from '../../../../app/ui/RequestState';
import { ActionDialog } from '../../../../app/ui/ActionDialog';
interface Credential { id: string; name: string; ownerMemberId: string; ownerName: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }
export function ScimAccess() {
  const resource = useResource<{ items: Credential[] }>('/api/developer/scim');
  const [pending, setPending] = useState(false), [error, setError] = useState<unknown>(), [notice, setNotice] = useState(''), [secret, setSecret] = useState('');
  const [action, setAction] = useState<{ credential: Credential; kind: 'rotate' | 'revoke' }>();
  return <section aria-label="Directory provisioning" style={{ minWidth: 0 }}>
    <h3>Directory provisioning</h3><p>Use SCIM to invite Members and manage their names, email addresses and groups. Owners and guests are protected. New and reactivated people must accept their invitation before they become active.</p>
    <p>Endpoint: <code>/scim/v2</code></p><p>Deactivating a Member removes their access and revokes their sessions and personal tokens immediately. Directory credentials work only at this endpoint.</p>
    {error ? <p role="alert">{errorMessage(error)}</p> : null}{notice ? <p role="status">{notice}</p> : null}
    {secret ? <section aria-label="New directory credential"><p>Save this secret now. It will not be shown again. Slate stores only its hash.</p><label>Directory secret<input type="password" readOnly value={secret} /></label><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(secret); setNotice('Directory secret copied.'); } catch (cause) { setError(cause); } }}>Copy directory secret</button><button type="button" onClick={() => setSecret('')}>I saved the directory secret</button></section> : null}
    <RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
      <button type="button" onClick={() => { void resource.reload(); }}>Refresh directory activity</button>
      {resource.data?.items.length ? <ul>{resource.data.items.map(credential => <li key={credential.id}><article aria-label={`Directory credential ${credential.name}`}><h4>{credential.name}</h4><p>Owner: {credential.ownerName}</p><p>Created: <DateStamp value={credential.createdAt} /></p><p>Last used: {credential.lastUsedAt ? <DateStamp value={credential.lastUsedAt} /> : 'Never'}</p><p>State: {credential.revokedAt ? 'Revoked' : 'Active'}</p><button type="button" onClick={() => setAction({ credential, kind: 'rotate' })}>Rotate {credential.name}</button>{!credential.revokedAt ? <button type="button" onClick={() => setAction({ credential, kind: 'revoke' })}>Revoke directory {credential.name}</button> : null}</article></li>)}</ul> : <p>No directory credentials have been created.</p>}
    </RequestState>
    <form className="detail-form" onSubmit={async event => {
      event.preventDefault(); const form = event.currentTarget, data = new FormData(form); setPending(true); setError(undefined); setSecret('');
      try { const result = await mutate<{ secret?: string }>('/api/developer/scim', { operationKey: operationKey(), name: String(data.get('name')) }); setSecret(result.secret ?? ''); form.reset(); await resource.reload(); setNotice('Directory credential created.'); }
      catch (cause) { setError(cause); } finally { setPending(false); }
    }}><fieldset disabled={pending} style={{ minWidth: 0 }}><label>Directory credential name<input name="name" required maxLength={80} /></label><button type="submit">Create directory credential</button></fieldset></form>
    {action ? <ActionDialog title={`${action.kind === 'rotate' ? 'Rotate' : 'Revoke'} ${action.credential.name}?`} action={action.kind === 'rotate' ? 'Rotate directory credential' : 'Revoke directory credential'} onClose={() => setAction(undefined)} onSubmit={async () => {
      const result = await mutate<{ secret?: string }>(`/api/developer/scim/${action.credential.id}/${action.kind}`, { operationKey: operationKey(), ...(action.kind === 'rotate' ? { name: action.credential.name } : {}) });
      setSecret(result.secret ?? ''); await resource.reload(); setNotice(action.kind === 'rotate' ? 'Directory credential rotated. The previous secret is refused.' : 'Directory credential revoked. Its next request is refused.');
    }}><p>{action.kind === 'rotate' ? 'The previous secret stops working immediately. Save the replacement secret and update your directory configuration.' : 'This immediately ends provisioning access for this credential.'}</p></ActionDialog> : null}
  </section>;
}
