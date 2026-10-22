import { useId, useState } from 'react';
import type { SamlSettingsInput, SamlSettingsView } from './SamlTypes';

export function SamlSettingsForm({ data, pending, onSave, onEdit }: {
  data: SamlSettingsView;
  pending: boolean;
  onSave: (input: SamlSettingsInput) => void;
  onEdit: () => void;
}) {
  const id = useId();
  const config = data.config;
  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [enforced, setEnforced] = useState(config?.enforced ?? false);
  return <form onChange={onEdit} onSubmit={event => {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const certificate = String(form.get('certificate') ?? '').trim();
    onSave({
      idpEntityId: String(form.get('idpEntityId') ?? '').trim(),
      ssoUrl: String(form.get('ssoUrl') ?? '').trim(),
      ...(certificate ? { certificate } : {}),
      emailDomain: String(form.get('emailDomain') ?? '').trim(),
      allowedEmails: String(form.get('allowedEmails') ?? '').split(/[\n,]+/).map(email => email.trim()).filter(Boolean),
      breakGlassOwnerId: String(form.get('breakGlassOwnerId') ?? ''),
      enabled,
      enforced,
    });
  }}>
    <fieldset disabled={pending} style={{ minWidth: 0, border: 0, padding: 0 }}>
      <legend>Identity provider</legend>
      <label htmlFor={`${id}-issuer`}>Identity provider issuer</label>
      <input id={`${id}-issuer`} name="idpEntityId" defaultValue={config?.idpEntityId ?? ''} required spellCheck={false} autoCapitalize="none" />
      <label htmlFor={`${id}-sso`}>Single sign-on URL</label>
      <input id={`${id}-sso`} name="ssoUrl" type="url" defaultValue={config?.ssoUrl ?? ''} required spellCheck={false} />
      <label htmlFor={`${id}-cert`}>Signing certificate</label>
      <textarea id={`${id}-cert`} name="certificate" rows={5} required={!config?.certificateConfigured} spellCheck={false} autoCapitalize="none" aria-describedby={`${id}-cert-help`} />
      <p id={`${id}-cert-help`} className="muted">Paste the identity provider’s public X.509 signing certificate in PEM format. Never paste a private key.{config?.certificateConfigured ? ' A certificate is saved. Leave this blank to keep it.' : ''}</p>
      <label htmlFor={`${id}-domain`}>Email domain</label>
      <input id={`${id}-domain`} name="emailDomain" defaultValue={config?.emailDomain ?? ''} placeholder="example.com" required spellCheck={false} autoCapitalize="none" aria-describedby={`${id}-domain-help`} />
      <p id={`${id}-domain-help`} className="muted">Use the domain your members sign in with. Changing it requires a new DNS verification.</p>
      <h3>Member access</h3>
      <label htmlFor={`${id}-allowlist`}>Allowed email addresses</label>
      <textarea id={`${id}-allowlist`} name="allowedEmails" rows={4} defaultValue={config?.allowedEmails.join('\n') ?? ''} spellCheck={false} autoCapitalize="none" aria-describedby={`${id}-allowlist-help`} />
      <p id={`${id}-allowlist-help`} className="muted">One exact email address at this domain per line. New members must match this list or have a workspace invitation. Verifying a domain does not give everyone on it access.</p>
      <label htmlFor={`${id}-owner`}>Emergency access owner</label>
      <select id={`${id}-owner`} name="breakGlassOwnerId" defaultValue={config?.breakGlassOwnerId ?? ''} required={enabled || enforced} aria-describedby={`${id}-owner-help`}>
        <option value="">Choose one active owner</option>
        {data.owners.map(owner => <option key={owner.id} value={owner.id}>{owner.displayName} · {owner.email}</option>)}
      </select>
      <p id={`${id}-owner-help`} className="muted">Exactly one active owner keeps email sign-in when SAML is required. Guests also keep email sign-in. Other members must use SAML.</p>
      <label><input type="checkbox" name="enabled" checked={enabled} onChange={event => { setEnabled(event.target.checked); if (!event.target.checked) setEnforced(false); }} />Enable SAML</label>
      <label><input type="checkbox" name="enforced" checked={enforced} disabled={!enabled || (!enforced && config?.domainStatus !== 'verified')} onChange={event => setEnforced(event.target.checked)} />Require SAML for members</label>
      {config?.domainStatus !== 'verified' ? <p className="muted">Verify your domain before requiring SAML.</p> : null}
      {enforced ? <p className="verify-warning">Before saving, check that your identity provider is ready and the designated owner can receive email sign-in links.</p> : null}
      {config ? <p className="muted">Saving changes ends current SAML sessions. People using SAML will need to sign in again.</p> : null}
      <button type="submit" className="secondary-button">Save SAML settings</button>
    </fieldset>
  </form>;
}
