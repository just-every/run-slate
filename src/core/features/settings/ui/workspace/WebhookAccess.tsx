import { useEffect, useState } from 'react';
import { useResource } from '../../../../client/useResource';
import { mutate, operationKey, errorMessage } from '../../../../client/transport';
import { RequestState } from '../../../../app/ui/RequestState';
import { ActionDialog } from '../../../../app/ui/ActionDialog';
interface Destination { id: string; name: string; memberId: string; memberName: string; containerId: string | null; mode: string; destination: string; events: string[]; state: string; createdAt: string; lastUsedAt: string | null; disabledReason: string | null }
interface Delivery { id: string; eventId: string; state: string; replayCount: number; nextAttemptAt: string | null; attempts: { attempt: number; status: number | null; durationMs: number; response: string; outcome: string; startedAt: string }[] }
export function WebhookAccess({ containers, canManage }: { containers: { id: string; name: string }[]; canManage: boolean }) {
  const resource = useResource<{ items: Destination[] }>('/api/developer/webhooks');
  useEffect(() => { const reload = () => { void resource.reload(); }; window.addEventListener('slate:webhook-created', reload); return () => window.removeEventListener('slate:webhook-created', reload); }, [resource.reload]);
  const [selected, setSelected] = useState<string | null>(null), [secret, setSecret] = useState(''), [remove, setRemove] = useState<Destination>();
  const [pending, setPending] = useState(false), [error, setError] = useState<unknown>(), [notice, setNotice] = useState('');
  const logs = useResource<{ items: Delivery[] }>(selected ? `/api/developer/webhooks/${selected}/deliveries` : null);
  async function action(path: string) {
    setError(undefined); setPending(true);
    try { await mutate(path, { operationKey: operationKey() }); await resource.reload(); if (selected) await logs.reload(); setNotice('Webhook updated.'); }
    catch (cause) { setError(cause); } finally { setPending(false); }
  }
  return <section aria-label="Webhooks" style={{ minWidth: 0 }}>
    <h3>Webhooks</h3><p>Send signed event updates to a public HTTPS destination. Destinations are checked before each delivery. Redirects are refused.</p>
    {error ? <p role="alert">{errorMessage(error)}</p> : null}{notice ? <p role="status">{notice}</p> : null}
    {secret ? <section aria-label="Webhook signing secret"><p>Save this signing secret now. It will not be shown again.</p><label>Signing secret<input type="password" aria-label="Signing secret" value={secret} readOnly /></label><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(secret); setNotice('Signing secret copied.'); } catch (cause) { setError(cause); } }}>Copy signing secret</button><button type="button" onClick={() => setSecret('')}>I saved the signing secret</button></section> : null}
    <RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
      {resource.data?.items.length ? <ul>{resource.data.items.map(destination => <li key={destination.id}><article aria-label={`Webhook ${destination.name}`}>
        <h4>{destination.name}</h4><p>{destination.destination}</p><p>Member: {destination.memberName}</p>
        {destination.mode === 'audit' ? <p>Workspace audit stream · Ordered delivery</p> : <><p>Space: {containers.find(c => c.id === destination.containerId)?.name ?? destination.containerId}</p><p>Events: {destination.events.join(', ')}</p></>}
        <p>Created: {new Date(destination.createdAt).toLocaleString()}</p><p>Last use: {destination.lastUsedAt ? new Date(destination.lastUsedAt).toLocaleString() : 'Never'}</p>
        <p>State: {destination.state}</p>{destination.disabledReason ? <p role="status">{destination.disabledReason}</p> : null}
        {canManage ? <button type="button" onClick={() => { setSelected(destination.id); void resource.reload(); }}>View deliveries for {destination.name}</button> : null}
        {canManage && destination.state === 'disabled' ? <button type="button" disabled={pending} onClick={() => { void action(`/api/developer/webhooks/${destination.id}/enable`); }}>Re-enable {destination.name}</button> : null}
        {destination.state !== 'removed' ? <button type="button" disabled={pending} onClick={() => setRemove(destination)}>Remove {destination.name}</button> : null}
      </article></li>)}</ul> : <p>No webhook destinations have been added.</p>}
    </RequestState>
    {selected ? <section aria-label="Webhook deliveries"><h4>Delivery history</h4><p>Recent deliveries and their attempts. Response excerpts are limited to 512 bytes.</p><button type="button" onClick={() => { void logs.reload(); }}>Refresh deliveries</button>
      <RequestState loading={logs.loading} error={logs.error} retry={logs.reload}>{logs.data?.items.length ? <ol>{logs.data.items.map(delivery => <li key={delivery.id}>
        <p>Event {delivery.eventId} · {delivery.state}{delivery.replayCount ? ' · Replayed' : ''}</p>
        {delivery.nextAttemptAt ? <p>Next attempt: {new Date(delivery.nextAttemptAt).toLocaleString()}</p> : null}
        <ol>{delivery.attempts.map(attempt => <li key={attempt.attempt}>Attempt {attempt.attempt}: {attempt.outcome} · {attempt.status ?? 'No response'} · {attempt.durationMs} ms<pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{attempt.response}</pre></li>)}</ol>
        {delivery.state !== 'pending' ? <button type="button" disabled={pending} onClick={() => { void action(`/api/developer/webhooks/${selected}/deliveries/${delivery.id}/replay`); }}>Replay event {delivery.eventId}</button> : null}
      </li>)}</ol> : <p>No deliveries yet.</p>}</RequestState>
    </section> : null}
    {canManage ? <><h4>Add a destination</h4>
    <form className="detail-form" onSubmit={async event => {
      event.preventDefault(); const form = event.currentTarget, data = new FormData(form); setPending(true); setError(undefined); setSecret('');
      try {
        const result = await mutate<{ secret?: string }>('/api/developer/webhooks', { operationKey: operationKey(), name: String(data.get('name')), containerId: String(data.get('containerId')), destination: String(data.get('destination')), events: data.getAll('events') });
        setSecret(result.secret ?? ''); form.reset(); await resource.reload(); setNotice('Webhook added.');
      } catch (cause) { setError(cause); } finally { setPending(false); }
    }}><fieldset disabled={pending} style={{ minWidth: 0 }}>
      <label>Webhook name<input name="name" required maxLength={80} /></label><label>Destination URL<input type="url" name="destination" required placeholder="https://your-service.example/events" /></label>
      <label>Webhook space<select name="containerId" aria-label="Webhook space" required><option value="">Choose a space</option>{containers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <fieldset><legend>Event kinds</legend>{['page', 'record', 'comment', 'status', 'verification', 'member'].map(kind => <label key={kind}><input type="checkbox" name="events" value={kind} defaultChecked={kind === 'page'} />{kind}</label>)}</fieldset>
      <button type="submit" className="primary">{pending ? 'Adding…' : 'Add webhook'}</button>
    </fieldset></form></> : <p>You can see and remove your own destinations. Workspace owners add and replay webhooks.</p>}
    {remove ? <ActionDialog title={`Remove ${remove.name}?`} action="Remove webhook" onClose={() => setRemove(undefined)} onSubmit={async () => { await mutate(`/api/developer/webhooks/${remove.id}/remove`, { operationKey: operationKey() }); await resource.reload(); }}><p>This stops deliveries and destroys the signing credential. A new destination needs a new signing secret.</p></ActionDialog> : null}
  </section>;
}
