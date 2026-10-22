import { useState } from 'react';
import { useWorkspace } from '../../../../app/ui/WorkspaceContext';
import { RequestState } from '../../../../app/ui/RequestState';
import { ActionDialog } from '../../../../app/ui/ActionDialog';
import { useResource } from '../../../../client/useResource';
import { errorMessage, mutate } from '../../../../client/transport';
import { SamlDomain } from './SamlDomain';
import { SamlSettingsForm } from './SamlSettingsForm';
import { savedSamlInput, type SamlSettingsInput, type SamlSettingsView } from './SamlTypes';

export function SamlSettings() {
  const { member } = useWorkspace();
  return member.role === 'owner' ? <OwnerSamlSettings /> : <section className="settings-panel"><h2>SAML single sign-on</h2><p>A workspace owner manages SAML single sign-on.</p></section>;
}

function OwnerSamlSettings() {
  const resource = useResource<SamlSettingsView>('/api/auth/saml');
  const [pending, setPending] = useState<'save' | 'verify' | 'disable' | null>(null);
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState<string>();
  const [disable, setDisable] = useState<SamlSettingsInput | null>(null);
  async function change(action: 'save' | 'verify' | 'disable', input?: SamlSettingsInput) {
    if (pending) return false;
    setPending(action);
    setError(undefined);
    setNotice(undefined);
    try {
      if (action === 'verify') await mutate('/api/auth/saml/verify-domain', {});
      else await mutate('/api/auth/saml', input, 'PUT');
      if (!await resource.reload()) throw new Error('The change was received, but the current SAML settings could not be loaded. Reload settings before making another change.');
      setNotice(action === 'verify' ? 'Domain check complete. See the current status below.' : action === 'disable' ? 'SAML is disabled.' : 'SAML settings saved.');
      return true;
    } catch (cause) {
      setError(cause);
      if (action === 'disable') throw cause;
      return false;
    } finally { setPending(null); }
  }
  return <section className="settings-panel" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
    <h2>SAML single sign-on</h2>
    <p>Connect your identity provider so members can sign in to Slate through SAML.</p>
    {pending ? <p role="status">{pending === 'verify' ? 'Checking domain…' : pending === 'disable' ? 'Disabling SAML…' : 'Saving SAML settings…'}</p> : notice ? <p role="status">{notice}</p> : null}
    {error ? <p role="alert">{errorMessage(error)}</p> : null}
    <RequestState loading={resource.loading} error={resource.error} retry={() => { setNotice(undefined); void resource.reload(); }}>
      {resource.data ? <>
        <p>SAML is <strong>{resource.data.config?.enabled ? 'enabled' : 'disabled'}</strong>. {resource.data.config?.enforced ? 'Members must use SAML.' : 'SAML is not required for members.'}</p>
        <details>
          <summary>Slate service provider details</summary>
          <p>Use these details when creating Slate’s SAML application in your identity provider.</p>
          <label htmlFor="saml-sp-entity">Service provider entity ID</label>
          <input id="saml-sp-entity" value={resource.data.entityId} readOnly />
          <label htmlFor="saml-sp-acs">Assertion consumer service URL (ACS)</label>
          <input id="saml-sp-acs" value={resource.data.acsUrl} readOnly />
          <a href={resource.data.metadataUrl}>Download SAML metadata</a>
        </details>
        <SamlSettingsForm key={resource.data.config ? JSON.stringify(savedSamlInput(resource.data.config)) : 'new'} data={resource.data} pending={Boolean(pending)} onEdit={() => setNotice(undefined)} onSave={input => {
          if (resource.data?.config?.enabled && !input.enabled) { setNotice(undefined); setDisable(input); }
          else void change('save', input);
        }} />
        <SamlDomain data={resource.data} pending={Boolean(pending)} onCheck={() => { void change('verify'); }} />
        {resource.data.config?.enabled ? <section>
          <h3>Disable SAML</h3>
          <p>Check email sign-in is available before disconnecting your identity provider.</p>
          <button type="button" className="secondary-button" disabled={Boolean(pending)} onClick={() => {
            const config = resource.data?.config;
            if (config) { setNotice(undefined); setDisable({ ...savedSamlInput(config), enabled: false, enforced: false }); }
          }}>Disable SAML</button>
        </section> : null}
      </> : null}
    </RequestState>
    {disable ? <ActionDialog title="Disable SAML?" action="Disable SAML" onClose={() => setDisable(null)} onSubmit={() => change('disable', disable)}>
      <p>Disabling SAML ends current SAML sessions and removes the requirement for members. Members will need email sign-in to return to the workspace.</p>
      <label><input type="checkbox" required />I have checked that workspace email sign-in is available.</label>
    </ActionDialog> : null}
  </section>;
}
