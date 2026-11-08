import { useState } from 'react';
import { Button } from '../../../../ui';
import { ActionDialog } from '../../../../app/ui/ActionDialog';
import { useResource } from '../../../../client/useResource';
import type { DatabaseDto } from '../../../../client/records';
import { useDatabaseView } from '../../../pages/ui/workspace/useDatabaseView';
import { FilterBuilder, type FilterValue } from '../../../databases/ui/workspace/FilterBuilder';
import { ViewCriteria } from '../../../databases/ui/workspace/ViewCriteria';
import { databaseViewDefinitionSchema, type DatabaseViewDefinition } from '../../database-view-definition';
import type { BlockRenderProps, DatabaseViewBlockData } from '../types';
import { useTaskPage } from './TaskPageContext';

function ViewSettings({ definition, onSave, onClose }: {
  definition: DatabaseViewDefinition; onSave: (definition: DatabaseViewDefinition) => void; onClose: () => void;
}) {
  const databases = useResource<{ items: { id: string; title: string }[] }>('/api/databases');
  const [databaseId, setDatabaseId] = useState(definition.databaseId ?? '');
  const [viewId, setViewId] = useState(definition.viewId ?? '');
  const source = useResource<DatabaseDto>(databaseId ? `/api/databases/${encodeURIComponent(databaseId)}` : null);
  const [filters, setFilters] = useState<FilterValue[]>(definition.filters);
  const [sorts, setSorts] = useState(definition.sorts);
  const fields = source.data?.fields ?? [];
  return <ActionDialog title="Database view settings" action="Save embedded view" onClose={onClose}
    submitDisabled={!databaseId || !viewId || source.loading || !!source.error || !source.data?.views.some(view => view.id === viewId)}
    onSubmit={async () => { onSave(databaseViewDefinitionSchema.parse({ databaseId, viewId, filters, ...(sorts === undefined ? {} : { sorts }) })); }}>
    <p>Filters apply in addition to the saved view. Sorts apply to this block only. Each reader sees their readable records.</p>
    <label>Database<select aria-label="Database" required value={databaseId} onChange={event => {
      setDatabaseId(event.target.value); setViewId(''); setFilters([]); setSorts(undefined);
    }}><option value="">Choose a database</option>
      {databaseId && !databases.data?.items.some(item => item.id === databaseId) ? <option value={databaseId}>Unavailable database</option> : null}
      {databases.data?.items.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
    </select></label>
    <label>Saved view<select aria-label="Saved view" required value={viewId} onChange={event => setViewId(event.target.value)}>
      <option value="">Choose a saved view</option>
      {viewId && !source.data?.views.some(view => view.id === viewId) ? <option value={viewId}>Unavailable view</option> : null}
      {source.data?.views.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}
    </select></label>
    {databases.error || source.error ? <p role="alert">The database view is unavailable.</p> : null}
    <fieldset><legend>Block filters</legend><FilterBuilder filters={filters} fields={fields} onChange={setFilters} /></fieldset>
    <fieldset><legend>Block sorts</legend>
      <label><input type="checkbox" checked={sorts === undefined} onChange={event => setSorts(event.target.checked ? undefined : [])} />Use saved view sorts</label>
      {sorts?.map((sort, index) => <div key={index} className="flex flex-wrap items-center gap-2">
        <label>Sort field<select aria-label={`Sort field ${index + 1}`} value={sort.field} onChange={event => setSorts(sorts.map((old, i) => i === index ? { ...old, field: event.target.value } : old))}>
          <option value="$title">Name</option>{fields.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}
        </select></label>
        <label>Sort direction<select aria-label={`Sort direction ${index + 1}`} value={sort.direction} onChange={event => setSorts(sorts.map((old, i) => i === index ? { ...old, direction: event.target.value as 'asc' | 'desc' } : old))}>
          <option value="asc">Ascending</option><option value="desc">Descending</option>
        </select></label>
        <Button type="button" variant="ghost" size="sm" onClick={() => setSorts(sorts.filter((_, i) => i !== index))}>Remove sort {index + 1}</Button>
      </div>)}
      <Button type="button" variant="ghost" size="sm" onClick={() => setSorts([...(sorts ?? []), { field: '$title', direction: 'asc' }])}>Add block sort</Button>
    </fieldset>
  </ActionDialog>;
}

export function DatabaseViewBlock({ block, canEdit, onChange }: BlockRenderProps<DatabaseViewBlockData>) {
  const page = useTaskPage();
  const [editing, setEditing] = useState(false);
  const current = useDatabaseView(page?.pageId, block.definition);
  const result = current.result;
  // Resolve names and values only through the current reader's query response.
  const visibleFields = result?.fields.filter(field => !['person', 'relation', 'file'].includes(field.type)
    && (!Array.isArray(result.view.display.visibleFieldIds) || result.view.display.visibleFieldIds.includes(field.id))).slice(0, 4) ?? [];
  return <section aria-label="Database view" className="my-2 min-w-0 rounded-card border border-line p-3 text-ui" data-database-view>
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="min-w-0 break-words font-medium">{result ? result.view.name : 'Database view'}</h3>
      {canEdit && page ? <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>Settings</Button> : null}
    </header>
    {!page ? <p>This view runs when used on a page.</p>
      : !block.definition.databaseId ? <p>Choose a database and saved view in Settings.</p>
        : current.unavailable ? <p role="status">The database view is unavailable.</p>
          : !result ? <p role="status">Loading database view…</p>
            : <>
              <ViewCriteria view={{ ...result.view, filters: [...result.view.filters, ...block.definition.filters], sorts: block.definition.sorts ?? result.view.sorts }} fields={result.fields} canClear={false} onClear={() => {}} />
              <p className="my-2" data-record-count>{result.records.length} readable {result.records.length === 1 ? 'record' : 'records'}</p>
              <div className="max-w-full overflow-x-auto"><table className="w-full text-left text-ui"><caption className="sr-only">{result.view.name}</caption>
                <thead><tr><th scope="col" className="p-2">Name</th>{visibleFields.map(field => <th scope="col" className="p-2" key={field.id}>{field.name}</th>)}</tr></thead>
                <tbody>{result.records.map(record => <tr key={record.pageId} data-record-id={record.pageId}>
                  <td className="p-2"><a className="underline" href={`/app/databases/${encodeURIComponent(block.definition.databaseId!)}/records/${encodeURIComponent(record.pageId)}`}>{record.title}</a></td>
                  {visibleFields.map(field => <td className="p-2" key={field.id}>{record.values[field.id] == null ? '—' : typeof record.values[field.id] === 'boolean' ? record.values[field.id] ? 'Yes' : 'No' : String(record.values[field.id])}</td>)}
                </tr>)}</tbody>
              </table></div>
              {!result.records.length ? <p>No readable records match this view.</p> : null}
            </>}
    {editing && canEdit && page ? <ViewSettings definition={block.definition} onClose={() => setEditing(false)} onSave={definition => { onChange({ ...block, definition }); setEditing(false); }} /> : null}
  </section>;
}
