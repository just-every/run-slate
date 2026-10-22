import { useId, useState } from 'react';
import { folderProviders, type FolderConnection, type FolderPolicy, type FolderProvider } from './FolderImportTypes';

export function FolderProviderSettings({ owner, policies, connections, disabled, onPolicy, onConnect, onDisconnect }: {
  owner: boolean;
  policies: FolderPolicy[];
  connections: FolderConnection[];
  disabled: boolean;
  onPolicy: (provider: FolderProvider, enabled: boolean) => void;
  onConnect: (input: { provider: FolderProvider; token: string; driveId?: string }) => void;
  onDisconnect: (connection: FolderConnection) => void;
}) {
  const [provider, setProvider] = useState<FolderProvider>('google-drive');
  const credentialHelp = useId();
  const enabled = (id: FolderProvider) => Boolean(policies.find(policy => policy.provider === id)?.enabled);
  const available = (Object.keys(folderProviders) as FolderProvider[]).filter(enabled);
  return <>
    {owner ? <details>
      <summary>Provider availability</summary>
      <p>Enable a provider so members can connect their own accounts. Each connection can read only what that member can access.</p>
      {(Object.entries(folderProviders) as [FolderProvider, string][]).map(([id, label]) => <div key={id}>
        <p>{label}: <strong>{enabled(id) ? 'Enabled' : 'Disabled'}</strong></p>
        <button type="button" className="secondary-button" disabled={disabled} onClick={() => onPolicy(id, !enabled(id))}>
          {enabled(id) ? 'Disable' : 'Enable'} {label}
        </button>
      </div>)}
    </details> : <p>Provider availability is managed by a workspace owner.</p>}
    {available.length === 0 ? <p>No folder providers are enabled. {owner ? 'Enable a provider above to connect your account.' : 'Ask a workspace owner to enable Google Drive or SharePoint.'}</p> : <details>
      <summary>Connect an account</summary>
      <form className="detail-form" autoComplete="off" onSubmit={event => {
        event.preventDefault();
        if (disabled) return;
        const form = event.currentTarget;
        const data = new FormData(form);
        const token = String(data.get('token') ?? '');
        const chosenProvider = String(data.get('provider')) as FolderProvider;
        const driveId = String(data.get('driveId') ?? '').trim();
        (form.elements.namedItem('token') as HTMLInputElement).value = '';
        data.delete('token');
        onConnect({ provider: chosenProvider, token, ...(chosenProvider === 'sharepoint' ? { driveId } : {}) });
      }}>
        <fieldset disabled={disabled} style={{ minWidth: 0, padding: 0, border: 0 }}>
          <legend>Your provider account</legend>
          <label>Folder provider<select name="provider" aria-label="Folder provider" value={available.includes(provider) ? provider : available[0]} onChange={event => setProvider(event.target.value as FolderProvider)}>
            {available.map(id => <option value={id} key={id}>{folderProviders[id]}</option>)}
          </select></label>
          <label>Delegated access token<input name="token" type="password" autoComplete="new-password" spellCheck={false} required aria-describedby={credentialHelp} /></label>
          <p id={credentialHelp} className="muted">Use a delegated token for the provider account matching your Slate email. The credential field clears when you submit. Imported files cannot exceed this account’s access.</p>
          {(available.includes(provider) ? provider : available[0]) === 'sharepoint' ? <label>Drive ID<input name="driveId" required spellCheck={false} /><small>The SharePoint document library or OneDrive drive containing your folder.</small></label> : null}
          <button type="submit" className="secondary-button">Connect account</button>
        </fieldset>
      </form>
    </details>}
    {connections.length ? <details>
      <summary>Your connected accounts ({connections.length})</summary>
      <ul className="settings-list">{connections.map(connection => <li key={connection.id}>
        <p><strong>{folderProviders[connection.provider]}</strong> · {connection.label} · {connection.state}</p>
        {connection.driveId ? <p className="muted">Drive: {connection.driveId}</p> : null}
        <button type="button" className="secondary-button" disabled={disabled || connection.state === 'disconnected'} onClick={() => onDisconnect(connection)}>Disconnect {connection.label}</button>
      </li>)}</ul>
    </details> : null}
  </>;
}
