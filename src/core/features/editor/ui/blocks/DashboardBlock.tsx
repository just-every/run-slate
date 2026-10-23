import { useEffect, useState } from 'react';
import { Button } from '../../../../ui';
import { mutate, errorMessage } from '../../../../client/transport';
import type { BlockRenderProps, DashboardBlockData } from '../types';
import type { DashboardResult } from '../../../databases/dashboard';
import type { DashboardDefinition } from '../../../databases/dashboard-definition';
import { useTaskPage } from './TaskPageContext';
import { DashboardTileEditor } from './DashboardTileEditor';

/** Only definitions are saved; results are scoped to this reader and this request. */
export function DashboardBlock({block, canEdit, onChange}: BlockRenderProps<DashboardBlockData>) {
  const page = useTaskPage();
  const [editing, setEditing] = useState(false), [filters, setFilters] = useState<DashboardDefinition['filters']>(block.definition.filters);
  const definition = JSON.stringify({...block.definition, filters}), pageId = page?.pageId;
  const [run, setRun] = useState<{key:string;result?:DashboardResult;error?:unknown}>();
  useEffect(() => {
    if (!pageId) return;
    const controller = new AbortController();
    void mutate<DashboardResult>(`/api/pages/${encodeURIComponent(pageId)}/dashboard`, JSON.parse(definition), 'POST', controller.signal)
      .then(result => {if (!controller.signal.aborted) setRun({key:definition,result});})
      .catch(error => {if (!controller.signal.aborted) setRun({key:definition,error});});
    return () => controller.abort();
  }, [pageId,definition]);
  const current = run?.key === definition ? run : undefined;
  return <section aria-label="Dashboard" className="my-2 min-w-0 rounded-card border border-line p-3" data-dashboard>
    <header className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-ui font-medium">Dashboard</h2>
      {canEdit ? <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(!editing)}>{editing ? 'Close tile editor' : 'Edit tiles'}</Button> : null}
    </header>
    <div className="my-3 grid min-w-0 gap-2 sm:grid-cols-3">
      <label>From date<input className="w-full min-w-0" aria-label="Dashboard from date" type="date" value={filters.from ?? ''} onChange={e => setFilters({...filters,from:e.target.value || undefined})}/></label>
      <label>Through date<input className="w-full min-w-0" aria-label="Dashboard through date" type="date" value={filters.to ?? ''} onChange={e => setFilters({...filters,to:e.target.value || undefined})}/></label>
      <label>Person<select className="w-full min-w-0" aria-label="Dashboard person" value={filters.personId ?? ''} onChange={e => setFilters({...filters,personId:e.target.value || undefined})}><option value="">All people</option>{page?.people.filter(person => person.canRead).map(person => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></label>
    </div>
    {canEdit && editing ? <DashboardTileEditor onAdd={tile => onChange({...block,definition:{...block.definition,tiles:[...block.definition.tiles,tile]}})}/> : null}
    {!page ? <p>This dashboard runs when placed on a page.</p> : !current ? <p role="status">Loading dashboard…</p>
      : current.error ? <p role="alert">{errorMessage(current.error)}</p> : null}
    {block.definition.tiles.length === 0 ? <p>Add charts and views to this dashboard.</p> : null}
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2" aria-busy={!!page && !current}>
      {current?.result?.tiles.map(result => {
        const tile = block.definition.tiles.find(tile => tile.id === result.id)!;
        const max = Math.max(1,...(result.series?.map(item => Math.abs(item.value ?? 0)) ?? []));
        return <section key={tile.id} aria-label={tile.title} className="min-w-0 rounded-card border border-line p-3" data-dashboard-tile>
          <h3 className="break-words text-ui font-medium">{tile.title}</h3>
          {result.state === 'access-needed' ? <p role="status">Access needed. Ask a database owner for access.</p>
            : result.series ? result.series.length ? result.series.map((item,index) => <div key={index} className="chart-row"><span className="break-words">{String(item.label ?? 'Empty')}</span><span className="chart-bar" style={{width:`${100 * Math.abs(item.value ?? 0) / max}%`}}/><strong data-dashboard-value>{item.value ?? '—'}</strong></div>) : <p>No matching records.</p>
              : <><p><strong data-dashboard-count>{result.records?.length ?? 0}</strong> records</p><ul>{result.records?.map(record => <li key={record.pageId}><a className="break-words" href={`/app/pages/${encodeURIComponent(record.pageId)}`}>{record.title}</a></li>)}</ul></>}
          {canEdit && editing ? <Button type="button" size="sm" variant="ghost" onClick={() => onChange({...block,definition:{...block.definition,tiles:block.definition.tiles.filter(item => item.id !== tile.id)}})}>Remove {tile.title}</Button> : null}
        </section>;
      })}
    </div>
  </section>;
}
