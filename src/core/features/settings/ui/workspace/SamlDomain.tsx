import { shortDate } from "../../../../app/ui/displayDate";
import { useId } from 'react';
import type { SamlSettingsView } from './SamlTypes';

function checkedTime(timestamp: number) {
  return shortDate(timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp);
}

export function SamlDomain({ data, pending, onCheck }: {
  data: SamlSettingsView;
  pending: boolean;
  onCheck: () => void;
}) {
  const id = useId();
  const config = data.config;
  return <section aria-labelledby={`${id}-heading`}>
    <h3 id={`${id}-heading`}>Domain verification</h3>
    {!config ? <p>Save your identity provider and email domain to get a DNS TXT record.</p> : <>
      <p>Add this TXT record to the DNS for <strong>{config.emailDomain}</strong>, then check the domain. Keep the record in place; Slate checks it daily.</p>
      <label htmlFor={`${id}-name`}>TXT name</label>
      <input id={`${id}-name`} readOnly value={data.txtName ?? ''} />
      <label htmlFor={`${id}-value`}>TXT value</label>
      <input id={`${id}-value`} readOnly value={data.txtValue ?? ''} />
      <p>Domain status: <strong>{config.domainStatus === 'verified' ? 'Verified' : config.domainStatus === 'failed' ? 'Verification failed' : 'Pending verification'}</strong></p>
      {config.domainVerifiedAt ? <p className="muted">Verified: {checkedTime(config.domainVerifiedAt)}</p> : null}
      {config.domainCheckedAt ? <p className="muted">Last checked: {checkedTime(config.domainCheckedAt)}</p> : <p className="muted">The domain has not been checked yet.</p>}
      {config.domainFailedAt ? <p className="verify-warning">Last failed check: {checkedTime(config.domainFailedAt)}{config.domainFailure ? ` · ${config.domainFailure}` : ''}</p> : config.domainFailure ? <p className="verify-warning">{config.domainFailure}</p> : null}
      {config.domainStatus === 'failed' ? <p className="verify-warning">Restore the TXT record and check again. New members cannot be created through SAML until verification succeeds. Existing members can still use SAML.</p> : null}
      <button type="button" className="secondary-button" disabled={pending} onClick={onCheck}>Check domain</button>
    </>}
  </section>;
}
