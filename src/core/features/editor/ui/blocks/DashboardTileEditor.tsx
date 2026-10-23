import { useState } from 'react';
import { useResource } from '../../../../client/useResource';
import type { DatabaseDto } from '../../../../client/records';
import type { DashboardTile } from '../../../databases/dashboard-definition';
import { Button } from '../../../../ui';

export function DashboardTileEditor({ onAdd }: { onAdd: (tile: DashboardTile) => void }) {
  const databases = useResource<{ items: { id: string; title: string }[] }>('/api/databases');
  const [databaseId, setDatabase] = useState(''), [viewId, setView] = useState('');
  const [kind, setKind] = useState<'chart' | 'view'>('chart'), [title, setTitle] = useState('');
  const [group, setGroup] = useState(''), [dateField, setDate] = useState(''), [personField, setPerson] = useState('');
  const [numeric, setNumeric] = useState('');
  const db = useResource<DatabaseDto>(databaseId ? `/api/databases/${encodeURIComponent(databaseId)}` : null);
  const valid = databaseId && (viewId || db.data?.views[0]?.id) && title.trim() && (kind === 'view' || group);
  return <fieldset className="grid min-w-0 gap-2 rounded-card border border-line p-3 sm:grid-cols-2">
    <legend>Add dashboard tile</legend>
    <label>Tile title<input aria-label="Tile title" className="w-full" value={title} onChange={e => setTitle(e.target.value)} maxLength={120}/></label>
    <label>Tile kind<select className="w-full" aria-label="Tile kind" value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="chart">Chart</option><option value="view">View</option></select></label>
    <label>Tile database<select className="w-full" aria-label="Tile database" value={databaseId} onChange={e => {setDatabase(e.target.value); setView(''); setGroup(''); setDate(''); setPerson(''); setNumeric('');}}><option value="">Choose database</option>{databases.data?.items.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    <label>Tile view<select className="w-full" aria-label="Tile view" value={viewId || db.data?.views[0]?.id || ''} onChange={e => setView(e.target.value)}><option value="">Choose view</option>{db.data?.views.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}</select></label>
    {kind === 'chart' ? <>
      <label>Chart group<select className="w-full" aria-label="Chart group" value={group} onChange={e => setGroup(e.target.value)}><option value="">Choose field</option>{db.data?.fields.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label>
      <label>Chart measure<select className="w-full" aria-label="Chart measure" value={numeric} onChange={e => setNumeric(e.target.value)}><option value="">Record count</option>{db.data?.fields.filter(field => field.type === 'number').map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label>
    </> : null}
    <label>Date filter field<select className="w-full" aria-label="Date filter field" value={dateField} onChange={e => setDate(e.target.value)}><option value="">Choose date field</option>{db.data?.fields.filter(field => field.type === 'date').map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label>
    <label>Person filter field<select className="w-full" aria-label="Person filter field" value={personField} onChange={e => setPerson(e.target.value)}><option value="">Choose person field</option>{db.data?.fields.filter(field => field.type === 'person').map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label>
    <Button type="button" disabled={!valid} onClick={() => {
      onAdd({ id: crypto.randomUUID(), title: title.trim(), kind, databaseId, viewId: viewId || db.data!.views[0].id,
        ...(dateField ? {dateField} : {}), ...(personField ? {personField} : {}), ...(kind === 'chart' ? {group} : {}),
        ...(numeric && kind === 'chart' ? {numeric} : {}), calculation: numeric ? 'sum' : 'count' });
      setTitle('');
    }}>Add tile</Button>
    {databases.error || db.error ? <p role="alert">The database is unavailable. Check your access and try again.</p> : null}
  </fieldset>;
}
