import type { FolderOmission, FolderReport, FolderTreeEntry } from './FolderImportTypes';

function sourceLink(url: string) {
  try { return new URL(url).protocol === 'https:' ? url : undefined; } catch { return undefined; }
}

function FolderTree({ entries }: { entries: FolderTreeEntry[] }) {
  const ids = new Set(entries.map(entry => entry.sourceId));
  const children = new Map<string | undefined, FolderTreeEntry[]>();
  for (const entry of entries) {
    const parent = entry.parentSourceId && ids.has(entry.parentSourceId) ? entry.parentSourceId : undefined;
    children.set(parent, [...(children.get(parent) ?? []), entry]);
  }
  function branch(parent?: string) {
    const items = children.get(parent);
    return items?.length ? <ul style={{ paddingInlineStart: 18, marginBlock: 8 }}>{items.map(entry => <li key={entry.sourceId}>
      {entry.folder ? <strong>{entry.title} <span className="muted">(folder)</span></strong> : entry.title}
      {branch(entry.sourceId)}
    </li>)}</ul> : null;
  }
  return <details className="import-report-section" open><summary>Folder tree</summary>{branch()}</details>;
}

function FolderOmissions({ label, items }: { label: string; items: FolderOmission[] }) {
  return <details className="import-report-section" open={items.length > 0}>
    <summary>{label} ({items.length.toLocaleString()})</summary>
    {items.length ? <ul>{items.map((item, index) => <li key={`${item.sourceId}:${index}`}>
      <strong>{item.name}</strong> — {item.reason.replace(/_/g, ' ').toLowerCase()}
      {item.detail ? <p>{item.detail}</p> : null}
      {sourceLink(item.url) ? <a className="transfer-action" href={item.url} target="_blank" rel="noreferrer">Open original · {item.name}</a> : null}
    </li>)}</ul> : <p>No files reported here.</p>}
  </details>;
}

export function FolderImportReview({ report, tree, preview = false, state, onImport, disabled }: {
  report: FolderReport;
  tree?: FolderTreeEntry[];
  preview?: boolean;
  state?: string;
  onImport?: () => void;
  disabled?: boolean;
}) {
  const completed = state === 'completed';
  return <section className="import-review" aria-label={preview ? 'Folder import review' : 'Retained folder import report'}>
    <h3>{preview ? 'Folder preview' : `Folder import · ${state}`}</h3>
    <p><strong>Private access:</strong> Imported pages are private to you. Source sharing permissions are not copied.</p>
    <p>Only files readable by your connected account can cross. Review every omitted file below before importing.</p>
    <dl className="transfer-counts">
      <div><dt>Folders</dt><dd>{report.folders.toLocaleString()}</dd></div>
      <div><dt>{preview ? 'Documents ready to import' : completed ? 'Documents imported' : 'Documents reviewed'}</dt><dd>{report.imported.length.toLocaleString()}</dd></div>
      <div><dt>Files not imported</dt><dd>{report.notImported.length.toLocaleString()}</dd></div>
      {Object.entries(report.counts ?? {}).map(([key, count]) => <div key={key}><dt>{key.replace(/([a-z])([A-Z])/g, '$1 $2')}</dt><dd>{count.toLocaleString()}</dd></div>)}
    </dl>
    {state === 'running' ? <p role="status">This import is still running. Completion has not been confirmed. Refresh the report to check its status.</p> : null}
    {state === 'failed' ? <p className="request-notice" role="alert">This import failed. {report.failure ? report.failure.replace(/_/g, ' ').toLowerCase() : 'Review the report and create a fresh preview before trying again.'} No completed import has been confirmed.</p> : null}
    {(tree ?? report.tree)?.length ? <FolderTree entries={(tree ?? report.tree)!} /> : null}
    <FolderOmissions label="Not imported" items={report.notImported} />
    {report.warnings.length ? <FolderOmissions label="Warnings" items={report.warnings} /> : null}
    <details className="import-report-section">
      <summary>{completed ? 'Imported documents' : 'Source documents'} ({report.imported.length.toLocaleString()})</summary>
      <ul>{report.imported.map(item => <li key={item.sourceId}>
        {completed && item.pageId ? <a className="transfer-action" href={`/app/pages/${encodeURIComponent(item.pageId)}`}>{item.name}</a> : <strong>{item.name}</strong>}
        {sourceLink(item.url) ? <><br /><a className="transfer-action" href={item.url} target="_blank" rel="noreferrer">Open original · {item.name}</a></> : null}
      </li>)}</ul>
    </details>
    {preview && onImport ? <div className="action-row transfer-actions"><button type="button" className="primary-button" disabled={disabled || !report.imported.length} onClick={onImport}>Import reviewed folder</button></div> : null}
    {!preview ? <p className="muted">This report is retained in Slate, including every file the provider reported as omitted.</p> : null}
  </section>;
}
