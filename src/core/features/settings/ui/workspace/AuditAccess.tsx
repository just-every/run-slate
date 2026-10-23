import { useState } from 'react';
import { useResource } from '../../../../client/useResource';
import { mutate, operationKey, errorMessage } from '../../../../client/transport';
import { RequestState } from '../../../../app/ui/RequestState';

export function AuditAccess({ onStreamCreated }: { onStreamCreated: () => void }) {
  const settings = useResource<{ retentionDays: number }>('/api/activity/settings');
  const [pending, setPending] = useState(false), [error, setError] = useState<unknown>(), [notice, setNotice] = useState(''), [secret, setSecret] = useState('');
  return <section aria-label="Audit access" style={{ minWidth: 0 }}>
    <h3>Audit history</h3><p>Export the actions visible to you, with their member, time and target. Exports contain no page or comment text. Each export covers at most 31 days and 10,000 entries.</p>
    {error ? <p role="alert">{errorMessage(error)}</p> : null}{notice ? <p role="status">{notice}</p> : null}
    <form className="detail-form" onSubmit={async event => {
      event.preventDefault(); const data = new FormData(event.currentTarget); setPending(true); setError(undefined);
      try {
        const response = await fetch('/api/activity/export', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operationKey: operationKey(), format: data.get('format'), from: new Date(`${data.get('from')}T00:00:00.000Z`).toISOString(), to: new Date(`${data.get('to')}T23:59:59.999Z`).toISOString(), ...Object.fromEntries(['actorId','action','targetId'].flatMap(key => data.get(key) ? [[key, String(data.get(key))]] : [])) }) });
        if (!response.ok) { const problem = await response.json() as { message?: string }; throw new Error(problem.message ?? 'The audit export was refused.'); }
        const blob = await response.blob(), url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = `slate-audit.${data.get('format')}`; link.click(); URL.revokeObjectURL(url); setNotice('Audit export downloaded.');
      } catch (cause) { setError(cause); } finally { setPending(false); }
    }}><fieldset disabled={pending} style={{ minWidth: 0 }}>
      <label>Audit start date (UTC)<input type="date" name="from" required defaultValue={new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)} /></label>
      <label>Audit end date (UTC)<input type="date" name="to" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
      <label>Member ID<input name="actorId" maxLength={160} /></label><label>Action kind<input name="action" maxLength={160} /></label><label>Target ID<input name="targetId" maxLength={160} /></label>
      <label>Export format<select name="format" aria-label="Export format"><option value="json">JSON</option><option value="csv">CSV</option></select></label>
      <button type="submit" className="primary">Download audit export</button>
    </fieldset></form>
    <RequestState loading={settings.loading} error={settings.error} retry={settings.reload}>{settings.data ? <form className="detail-form" onSubmit={async event => {
      event.preventDefault(); const data = new FormData(event.currentTarget); setPending(true); setError(undefined);
      try { await mutate('/api/activity/settings', { operationKey: operationKey(), retentionDays: Number(data.get('days')) }, 'PUT'); await settings.reload(); setNotice('Audit retention saved.'); }
      catch (cause) { setError(cause); } finally { setPending(false); }
    }}><fieldset disabled={pending} style={{ minWidth: 0 }}><label>Audit retention (days)<input type="number" name="days" required min={365} step={1} defaultValue={settings.data.retentionDays} /></label><p>Keep at least one year of audit history. Entries waiting for delivery are kept until delivery finishes.</p><button type="submit">Save audit retention</button></fieldset></form> : null}</RequestState>
    <h4>Stream audit history</h4><p>Send new audit entries through an ordered signed webhook. After an outage, delivery resumes with the oldest waiting entry. Receivers use the event ID to discard duplicates.</p>
    {secret ? <section aria-label="Audit signing secret"><p>Save this signing secret now. It will not be shown again.</p><label>Audit signing secret<input type="password" value={secret} readOnly /></label><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(secret); setNotice('Audit signing secret copied.'); } catch (cause) { setError(cause); } }}>Copy audit signing secret</button><button type="button" onClick={() => setSecret('')}>I saved the audit signing secret</button></section> : null}
    <form className="detail-form" onSubmit={async event => {
      event.preventDefault(); const form = event.currentTarget, data = new FormData(form); setPending(true); setError(undefined); setSecret('');
      try { const result = await mutate<{ secret?: string }>('/api/activity/streams', { operationKey: operationKey(), name: String(data.get('name')), destination: String(data.get('destination')) }); setSecret(result.secret ?? ''); form.reset(); onStreamCreated(); setNotice('Audit stream added.'); }
      catch (cause) { setError(cause); } finally { setPending(false); }
    }}><fieldset disabled={pending} style={{ minWidth: 0 }}><label>Audit stream name<input name="name" required maxLength={80} /></label><label>Audit destination URL<input type="url" name="destination" required placeholder="https://your-service.example/audit" /></label><button type="submit">Add audit stream</button></fieldset></form>
  </section>;
}
