import { useState } from 'react';
import { useResource } from '../../../../client/useResource';
import { RequestState } from '../../../../app/ui/RequestState';
import { reportKinds, reportLabels, type AnalyticsReport, type ReportKind, type ReportScopes } from '../../report-types';

export function AnalyticsReports({ containerId }: { containerId: string }) {
  const scopes = useResource<ReportScopes>('/api/analytics/report-scopes');
  const [kind, setKind] = useState<ReportKind>('views');
  const [scope, setScope] = useState(containerId);
  const [filters, setFilters] = useState('');
  const allowed = !!scopes.data && (scopes.data.workspace || scopes.data.containers.some(c => c.id === containerId));
  const query = new URLSearchParams({ report: kind });
  if (scope) query.set('containerId', scope);
  const path = `/api/analytics/reports?${query}${filters}`;
  const report = useResource<AnalyticsReport>(allowed ? path : null);
  if (!allowed) return null;
  return <section aria-label="Owner analytics reports">
    <h3>Owner reports</h3>
    <div className="analytics-controls">
      <label>Report<select value={kind} onChange={e => setKind(e.target.value as ReportKind)}>
        {reportKinds.map(key => <option key={key} value={key}>{reportLabels[key]}</option>)}
      </select></label>
      <label>Report scope<select value={scope} onChange={e => setScope(e.target.value)}>
        {scopes.data?.workspace ? <option value="">Workspace</option> : null}
        {scopes.data?.containers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select></label>
    </div>
    <form className="detail-form" onSubmit={e => {
      e.preventDefault();
      const data = new FormData(e.currentTarget), next = new URLSearchParams();
      for (const key of ['from', 'to']) {
        const value = String(data.get(key) || '');
        if (value) next.set(key, `${value}T${key === 'to' ? '23:59:59.999' : '00:00:00.000'}Z`);
      }
      next.set('staleDays', String(data.get('staleDays') || '90'));
      setFilters(`&${next}`);
    }}>
      <label>Report from<input type="date" name="from" /></label>
      <label>Report until<input type="date" name="to" /></label>
      <label>Stale after (days)<input type="number" name="staleDays" min="1" max="36500" defaultValue="90" required /></label>
      <button>Apply report filters</button>
    </form>
    <p className="muted">Dates use UTC. Views, searches and growth use the selected dates. Staleness is measured at Until (or today); ownership and verification reports show current state.</p>
    <p className="muted">Only pages you can read are included. Growth counts retained published pages, including archived pages. Search counts contain no reader identities; space reports include only searches scoped to that space.</p>
    <RequestState loading={report.loading} error={report.error} retry={report.reload}>
      {report.data ? <>
        <a href={`${path}&format=csv`} download>Export report as CSV</a>
        {report.data.rows.length ? <div style={{ overflowX: 'auto' }} tabIndex={0} role="region" aria-label="Report table">
          <table><caption>{report.data.title}</caption><thead><tr>{report.data.columns.map(c => <th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
            <tbody>{report.data.rows.map((row, index) => <tr key={index}>{report.data!.columns.map(c => <td key={c.key}>{c.key === 'title' && row.pageId ? <a href={`/app/pages/${encodeURIComponent(String(row.pageId))}`}>{row[c.key]}</a> : row[c.key] ?? 'Never'}</td>)}</tr>)}</tbody>
          </table>
        </div> : <p>No matching rows.</p>}
      </> : null}
    </RequestState>
  </section>;
}
