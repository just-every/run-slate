import { useState } from 'react';
import { useResource } from '../../../../client/useResource';
import { mutate, operationKey, errorMessage } from '../../../../client/transport';
import { RequestState } from '../../../../app/ui/RequestState';
import { ActionDialog } from '../../../../app/ui/ActionDialog';
import type { TokenView } from '../../../public-api/model';

interface Administration { owner: boolean; items: TokenView[]; containers: { id: string; name: string }[] }
export function DeveloperAccess() {
  const resource = useResource<Administration>('/api/developer/tokens');
  const [secret, setSecret] = useState(''), [copied, setCopied] = useState(false), [revoke, setRevoke] = useState<TokenView>();
  const [pending, setPending] = useState(false), [error, setError] = useState<unknown>(), [notice, setNotice] = useState('');
  return <section className="settings-panel" style={{ minWidth: 0, overflowWrap: 'anywhere' }} aria-label="Developer access">
    <h2>Developer access</h2>
    <p>Use a personal token to read or update pages and tasks through the API. Each token acts with its member’s current access in the spaces you choose.</p>
    <a href="/api/v1/openapi.json">Read the API specification</a>
    {notice ? <p role="status">{notice}</p> : null}
    {error ? <p role="alert">{errorMessage(error)}</p> : null}
    {secret ? <section aria-label="New token secret">
      <h3>Save your token now</h3><p>This secret is shown once. Store it securely; it will not be shown again.</p>
      <label>Token secret<input type="password" aria-label="Token secret" readOnly value={secret} spellCheck={false} /></label>
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(secret); setCopied(true); } catch (cause) { setError(cause); } }}>{copied ? 'Copied' : 'Copy token'}</button>
      <button type="button" onClick={() => { setSecret(''); setCopied(false); }}>I saved my token</button>
    </section> : null}
    <RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
      {resource.data ? <>
        <h3>{resource.data.owner ? 'Workspace tokens' : 'Your tokens'}</h3>
        <p>{resource.data.owner ? 'You can see and revoke every member’s token.' : 'You can see and revoke your own tokens.'}</p>
        <button type="button" className="secondary-button" onClick={() => { void resource.reload(); }}>Refresh token activity</button>
        {resource.data.items.length ? <ul style={{ paddingInlineStart: '1.25rem' }}>{resource.data.items.map(token => <li key={token.id}>
          <article aria-label={`Token ${token.name}`}>
            <h4>{token.name}</h4><p>Member: {token.memberName}</p>
            <p>Spaces: {token.scopes.map(scope => `${resource.data!.containers.find(c => c.id === scope.containerId)?.name ?? scope.containerId} (${scope.level})`).join(', ')}</p>
            <p>Created: <time dateTime={token.createdAt}>{new Date(token.createdAt).toLocaleString()}</time></p>
            <p>Expires: <time dateTime={token.expiresAt}>{new Date(token.expiresAt).toLocaleString()}</time></p>
            <p>Last used: {token.lastUsedAt ? <time dateTime={token.lastUsedAt}>{new Date(token.lastUsedAt).toLocaleString()}</time> : 'Never'}</p>
            <p>State: {token.revokedAt ? 'Revoked' : token.expiresAt <= new Date().toISOString() ? 'Expired' : 'Active'}</p>
            {!token.revokedAt ? <button type="button" onClick={() => setRevoke(token)}>Revoke {token.name}</button> : null}
          </article>
        </li>)}</ul> : <p>No personal tokens have been created.</p>}
        <h3>Create a token</h3>
        <form className="detail-form" onSubmit={async event => {
          event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
          const scopes = resource.data!.containers.flatMap(container => { const level = String(data.get(container.id) ?? ''); return level ? [{ containerId: container.id, level }] : []; });
          setPending(true); setError(undefined); setNotice(''); setSecret('');
          try {
            const created = await mutate<{ secret?: string }>('/api/developer/tokens', { operationKey: operationKey(), name: String(data.get('name')), scopes, ...(data.get('expires') ? { expiresAt: new Date(`${data.get('expires')}T23:59:59.999Z`).toISOString() } : {}) });
            setSecret(created.secret ?? ''); setCopied(false); form.reset();
            if (!await resource.reload()) throw new Error('Token created. Reload settings to see its current state.');
            setNotice('Token created.');
          } catch (cause) { setError(cause); } finally { setPending(false); }
        }}>
          <fieldset disabled={pending} style={{ minWidth: 0 }}>
            <label>Token name<input name="name" required maxLength={80} autoComplete="off" /></label>
            <label>Expiry date (UTC)<input type="date" name="expires" aria-describedby="token-expiry-help" /></label>
            <p id="token-expiry-help">Leave empty for 90 days. The maximum lifetime is one year.</p>
            <p>Choose at least one space. Read access cannot write.</p>
            {resource.data.containers.map(container => <label key={container.id}>{container.name}<select name={container.id} aria-label={`Access to ${container.name}`} defaultValue=""><option value="">No access</option><option value="read">Read</option><option value="write">Read and write</option></select></label>)}
            <button type="submit" className="primary" disabled={!resource.data.containers.length}>{pending ? 'Creating…' : 'Create token'}</button>
          </fieldset>
        </form>
        <h3>Webhooks</h3><p>No webhook destinations are available yet.</p>
        <h3>Applications</h3><p>Application authorization and remote clients are not available yet.</p>
      </> : null}
    </RequestState>
    {revoke ? <ActionDialog title={`Revoke ${revoke.name}?`} action="Revoke token" onClose={() => setRevoke(undefined)} onSubmit={async () => {
      await mutate(`/api/developer/tokens/${revoke.id}/revoke`, { operationKey: operationKey() });
      if (!await resource.reload()) throw new Error('Token revoked. Reload settings to see its current state.');
      setNotice('Token revoked. Its next API request will be refused.');
    }}><p>This ends the token’s access immediately. {revoke.memberName} can create a new token if needed.</p></ActionDialog> : null}
  </section>;
}
