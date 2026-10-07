import type { Story } from './stories';
import { DatabaseSurface } from '../../src/core/features/databases/ui/DatabaseSurface';
import { TableView } from '../../src/core/features/databases/ui/views/TableView';
import { BoardView } from '../../src/core/features/databases/ui/views/BoardView';
import { ListView } from '../../src/core/features/databases/ui/views/ListView';
import { GalleryView } from '../../src/core/features/databases/ui/views/GalleryView';
import { CalendarView } from '../../src/core/features/databases/ui/views/CalendarView';
import { TimelineView } from '../../src/core/features/databases/ui/views/TimelineView';
import type { DatabaseField, DatabaseRecord, DatabaseLayout, DatabaseView } from '../../src/core/features/databases/ui/types';
import type { SurfaceState } from '../../src/core/ui';
const action = () => { document.documentElement.dataset.lastAction = 'database-action'; };
const fields: DatabaseField[] = [
  { id: 'status', name: 'Status', type: 'status', editable: true, options: [{ id: 'ready', label: 'Ready', colour: 'green' }, { id: 'review', label: 'In review', colour: 'yellow' }] },
  { id: 'owner', name: 'Owner', type: 'person', editable: true },
  { id: 'reviewDate', name: 'Review date', type: 'date', editable: true },
];
const records: DatabaseRecord[] = [
  { id: 'record-1', title: 'Escalation guide', icon: { kind: 'emoji', emoji: '📘' }, hasBody: true, values: { status: { kind: 'options', optionIds: ['ready'] }, owner: { kind: 'people', people: [{ id: 'ada', name: 'Ada Chen' }] }, reviewDate: { kind: 'date', display: '12 September 2026' } } },
  { id: 'record-2', title: 'New colleague checklist', icon: { kind: 'emoji', emoji: '✅' }, hasBody: true, values: { status: { kind: 'options', optionIds: ['review'] }, owner: { kind: 'people', people: [{ id: 'sam', name: 'Sam Patel' }] }, reviewDate: { kind: 'date', display: '18 September 2026' } } },
];
const layouts: DatabaseLayout[] = ['table', 'board', 'list', 'gallery', 'calendar', 'timeline'];
const view = (layout: DatabaseLayout): DatabaseView => ({ id: layout, name: layout[0].toUpperCase() + layout.slice(1), layout, groupFieldId: layout === 'board' ? 'status' : null, dateFieldId: ['calendar','timeline'].includes(layout) ? 'reviewDate' : null, filter: { conjunction: 'and', rules: [] }, sorts: [], visibleFieldIds: fields.map(f => f.id), hideEmptyGroups: false, calculations: {} });
const shared = { fields, records, showRecordIcon: true, canEditRecords: true, onOpenRecord: action, onValueChange: action, onEditValue: action, onOpenLink: action, onNewRecord: action };
function Layout({ layout }: { layout: DatabaseLayout }) {
  if (layout === 'table') return <TableView {...shared} titleColumnLabel="Document" calculations={{}} onCalculationChange={action} />;
  if (layout === 'list') return <ListView {...shared} />;
  if (layout === 'gallery') return <GalleryView {...shared} />;
  if (layout === 'board') return <BoardView groups={[{ id: 'ready', label: 'Ready', colour: 'green', count: 1, records: [records[0]] }, { id: 'review', label: 'In review', colour: 'yellow', count: 1, records: [records[1]] }, { id: 'draft', label: 'Draft', colour: 'neutral', count: 0, records: [] }]} groupFieldName="Status" cardFields={fields.slice(1)} showRecordIcon canEditRecords canMoveBetweenGroups hideEmptyGroups={false} onHideEmptyGroupsChange={action} onOpenRecord={action} onMoveRecord={action} onOpenLink={action} onNewRecordInGroup={action} />;
  if (layout === 'calendar') return <CalendarView monthLabel="September 2026" weekdayLabels={['Mon','Tue','Wed','Thu','Fri','Sat','Sun']} days={Array.from({ length: 35 }, (_, index) => ({ id: `day-${index}`, label: String(index === 0 ? 31 : index <= 30 ? index : index - 30), inCurrentMonth: index > 0 && index <= 30, isToday: index === 12, records: index === 12 ? [records[0]] : index === 18 ? [records[1]] : [] }))} dateFieldName="Review date" showRecordIcon onOpenRecord={action} onPreviousMonth={action} onNextMonth={action} onToday={action} />;
  return <TimelineView bars={records.map((record, index) => ({ record, startPercent: 15 + index * 25, widthPercent: 30, rangeLabel: index ? '18–25 Sep' : '12–19 Sep' }))} columnLabels={['7 Sep','14 Sep','21 Sep','28 Sep']} dateFieldName="Review date" showRecordIcon onOpenRecord={action} />;
}
function DatabaseStory({ layout = 'table', state = 'ready' }: { layout?: DatabaseLayout; state?: SurfaceState }) {
  return <DatabaseSurface name="Knowledge register" icon={{ kind: 'emoji', emoji: '📚' }} state={state} views={layouts.map(view)} activeViewId={layout} fields={fields} lock={null} canEdit searchInView="" onSelectView={action} onRenameView={action} onDuplicateView={action} onDeleteView={action} onAddView={action} onSearchInViewChange={action} onOpenFilter={action} onOpenSort={action} onOpenGroup={action} onOpenSettings={action} onClearRules={action} onNewRecord={action} onNewRecordMenu={action} onRetry={action} onRequestAccess={action}><Layout layout={layout} /></DatabaseSurface>;
}
export const databaseStories: Story[] = [
  ...layouts.map(layout => ({ id: `database-${layout}`, title: `Database · ${layout}`, clauses: ['DB-001','DB-003','DB-004'], render: () => <DatabaseStory layout={layout} /> })),
  ...(['empty','denied','loading','error'] as SurfaceState[]).map(state => ({ id: `database-${state}`, title: `Database · ${state}`, clauses: ['DB-001','DB-012'], render: () => <DatabaseStory state={state} /> })),
];
