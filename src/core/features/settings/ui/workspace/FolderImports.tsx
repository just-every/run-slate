import { useDateText } from "../../../../app/ui/displayDate";
import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../../../../app/ui/WorkspaceContext';
import { RequestState } from '../../../../app/ui/RequestState';
import { useResource } from '../../../../client/useResource';
import { errorMessage, mutate, operationKey } from '../../../../client/transport';
import { FolderProviderSettings } from './FolderProviderSettings';
import { FolderImportReview } from './FolderImportReview';
import { folderImportPath, folderProviders, type FolderDestination, type FolderImportIndex, type FolderPreview, type FolderRun, type FolderSelection } from './FolderImportTypes';

export function FolderImports() {
  const dateText = useDateText();
  const { member } = useWorkspace();
  const resource = useResource<FolderImportIndex>(folderImportPath);
  const destinations = useResource<{ items: FolderDestination[] }>(`${folderImportPath}/destinations`);
  const [selectedRun, setSelectedRun] = useState('');
  const report = useResource<FolderRun>(selectedRun ? `${folderImportPath}/runs/${encodeURIComponent(selectedRun)}` : null);
  const [preview, setPreview] = useState<{ result: FolderPreview; selection: FolderSelection }>();
  const [pending, setPending] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<unknown>();
  const busy = useRef(false);
  const selectLatest = useRef(false);
  const importKey = useRef<string | null>(null);
  useEffect(() => {
    if ((!selectedRun || selectLatest.current) && resource.data?.runs.length) {
      selectLatest.current = false;
      setSelectedRun(resource.data.runs[0].id);
    }
  }, [resource.data, selectedRun]);

  function clearPreview() { setPreview(undefined); importKey.current = null; }

  async function act(label: string, work: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setPending(label);
    setNotice('');
    setError(undefined);
    try { await work(); }
    catch (cause) { setError(cause); await resource.reload(); }
    finally { busy.current = false; setPending(''); }
  }

  const usable = resource.data?.connections.filter(connection => connection.state === 'connected' && resource.data?.policies.some(policy => policy.provider === connection.provider && Boolean(policy.enabled))) ?? [];
  return <section className="workspace-transfer-panel" aria-label="Folder imports" aria-live="polite">
    <h3>Folder imports</h3>
    <p>Bring a Google Drive or SharePoint / OneDrive folder into Slate. Review the folder tree and any files that cannot be imported, then create private pages beneath an existing page.</p>
    <RequestState loading={resource.loading} error={resource.error} retry={() => void resource.reload()}>
      {resource.data ? <>
        <FolderProviderSettings owner={member.role === 'owner'} policies={resource.data.policies} connections={resource.data.connections} disabled={!!pending}
          onPolicy={(provider, enabled) => void act(`Updating ${folderProviders[provider]} availability…`, async () => {
            await mutate(`${folderImportPath}/policy`, { operationKey: operationKey(), provider, enabled }, 'PUT');
            clearPreview();
            await resource.reload();
            setNotice(`${folderProviders[provider]} ${enabled ? 'enabled' : 'disabled'} for folder imports.`);
          })}
          onConnect={input => void act('Connecting your account…', async () => {
            await mutate(`${folderImportPath}/connections`, { operationKey: operationKey(), ...input });
            clearPreview();
            await resource.reload();
            setNotice('Account connected. Choose a folder to preview.');
          })}
          onDisconnect={connection => void act('Disconnecting your account…', async () => {
            await mutate(`${folderImportPath}/connections/${encodeURIComponent(connection.id)}`, { operationKey: operationKey(), expectedRevisionId: connection.revisionId }, 'DELETE');
            clearPreview();
            await resource.reload();
            setNotice(`${connection.label} disconnected. Retained import reports remain available.`);
          })} />
        {usable.length ? <RequestState loading={destinations.loading} error={destinations.error} retry={() => void destinations.reload()}>
          {destinations.data?.items.length ? <form className="detail-form" onChange={clearPreview} onSubmit={event => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const destination = destinations.data!.items.find(item => item.id === data.get('destination'));
            if (!destination) return;
            const selection: FolderSelection = { connectionId: String(data.get('connection')), folderId: String(data.get('folderId')).trim(), destination: { pageId: destination.id, expectedRevisionId: destination.revisionId } };
            void act('Reading the folder and preparing a preview…', async () => {
              clearPreview();
              const result = await mutate<FolderPreview>(`${folderImportPath}/preview`, selection);
              setPreview({ result, selection });
              setNotice('Folder preview ready. No pages have been created.');
            });
          }}>
            <fieldset disabled={!!pending} style={{ minWidth: 0, padding: 0, border: 0 }}>
              <legend>Choose a source folder</legend>
              <label>Connected account<select name="connection" aria-label="Connected account" required>{usable.map(connection => <option key={connection.id} value={connection.id}>{folderProviders[connection.provider]} · {connection.label}{connection.driveId ? ` · ${connection.driveId}` : ''}</option>)}</select></label>
              <label>Folder ID<input aria-label="Folder ID" name="folderId" required spellCheck={false} maxLength={200} /><small>Use the folder ID from Google Drive, SharePoint or OneDrive.</small></label>
              <label>Import below<select name="destination" aria-label="Import below" required defaultValue=""><option value="" disabled>Choose a destination page</option>{destinations.data.items.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
              <p className="muted">The destination must be a page you can edit. New pages remain private to you.</p>
              <button type="submit" className="secondary-button">Preview folder</button>
            </fieldset>
          </form> : destinations.data ? <p>Create an editable page in Slate before importing a folder.</p> : null}
        </RequestState> : resource.data.connections.some(connection => connection.state === 'connected') ? <p>Enable the provider for a connected account to preview a folder.</p> : null}
      </> : null}
    </RequestState>
    {pending ? <p role="status">{pending} Completion has not been confirmed.</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {error ? <p className="request-notice" role="alert">{errorMessage(error)}</p> : null}
    {preview ? <FolderImportReview preview report={preview.result.report} tree={preview.result.tree} disabled={!!pending} onImport={() => void act('Importing the reviewed folder…', async () => {
      importKey.current ??= operationKey();
      selectLatest.current = true;
      const next = await mutate<FolderRun>(`${folderImportPath}/runs`, { ...preview.selection, operationKey: importKey.current, previewFingerprint: preview.result.fingerprint });
      selectLatest.current = false;
      setSelectedRun(next.id);
      clearPreview();
      await Promise.all([resource.reload(), destinations.reload()]);
      if (selectedRun === next.id) await report.reload();
      setNotice(next.state === 'completed' ? 'Folder imported. The retained report is below.' : 'Import submitted. Check the retained report for its current status.');
      window.dispatchEvent(new Event('slate:navigation-changed'));
    })} /> : null}
    {resource.data?.runs.length ? <>
      <label>Retained folder imports<select aria-label="Retained folder imports" value={selectedRun} disabled={!!pending} onChange={event => setSelectedRun(event.target.value)}>{resource.data.runs.map(run => <option value={run.id} key={run.id}>{run.state} · {dateText(run.createdAt)}</option>)}</select></label>
      <button className="secondary-button" type="button" disabled={!!pending || report.loading} onClick={() => void act('Refreshing the folder import report…', async () => { await Promise.all([report.reload(), resource.reload()]); })}>Refresh folder import report</button>
    </> : null}
    <RequestState loading={report.loading} error={report.error} retry={() => void report.reload()}>
      {report.data ? <FolderImportReview report={report.data.report} state={report.data.state} /> : null}
    </RequestState>
  </section>;
}
