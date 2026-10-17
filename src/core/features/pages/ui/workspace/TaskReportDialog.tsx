import { ActionDialog } from '../../../../app/ui/ActionDialog';
import { useWorkspace } from '../../../../app/ui/WorkspaceContext';
import { useResource } from '../../../../client/useResource';
import { errorMessage } from '../../../../client/transport';
import type { PageDocument } from '../../../../shared/api/content';
import { useTaskPage } from '../../../editor/ui/blocks/TaskPageContext';
import { taskReportDefinitionSchema, type TaskReportDefinition } from '../../../work-items/report-definition';

interface Choice { id: string; label: string }
function savedChoice(choices: Choice[], id?: string): Choice[] {
  const unique = [...new Map(choices.map(choice => [choice.id, choice])).values()];
  return id && !unique.some(choice => choice.id === id) ? [{ id, label: 'Current selection' }, ...unique] : unique;
}

/** Guests use only their authorized page and navigation people; no directory or index request is made. */
export function TaskReportDialog({ pageId, definition, onSave, onClose }: {
  pageId: string; definition: TaskReportDefinition;
  onSave: (definition: TaskReportDefinition) => Promise<void>; onClose: () => void;
}) {
  const { navigation } = useWorkspace(), taskPage = useTaskPage();
  const canList = navigation.data?.isGuest === false;
  const spaces = useResource<{ items: { id: string; name: string }[] }>(canList ? '/api/containers' : null);
  const pages = useResource<{ items: { id: string; title: string }[] }>(canList ? '/api/pages' : null);
  const members = useResource<{ items: { id: string; displayName: string }[] }>(canList ? '/api/members' : null);
  const sourcePage = useResource<PageDocument>(`/api/pages/${encodeURIComponent(pageId)}`);
  const spaceChoices = savedChoice([
    ...(spaces.data?.items ?? navigation.data?.containers ?? []).map(item => ({ id: item.id, label: item.name })),
    ...(sourcePage.data ? [{ id: sourcePage.data.page.containerId, label: 'This page’s space' }] : []),
  ], definition.containerId);
  const pageChoices = savedChoice([
    ...(pages.data?.items ?? navigation.data?.recents ?? []).map(item => ({ id: item.id, label: item.title })),
    ...(sourcePage.data ? [{ id: pageId, label: sourcePage.data.page.title }] : []),
  ], definition.ancestorPageId);
  const people = (members.data?.items ?? taskPage?.people ?? []).map(item => ({ id: item.id, label: item.displayName }));
  const selectedAssignee = definition.assignee?.kind === 'member' ? definition.assignee.memberId : undefined;
  const failures = [navigation.error, sourcePage.error, spaces.error, pages.error, members.error].filter(Boolean);
  const loading = navigation.loading || sourcePage.loading || spaces.loading || pages.loading || members.loading;
  return <ActionDialog title="Edit task report" action="Save report" onClose={onClose} onSubmit={async data => {
    const optional = (key: string) => String(data.get(key) ?? '').trim() || undefined;
    const assignee = optional('assignee');
    const parsed = taskReportDefinitionSchema.safeParse({
      containerId: optional('containerId'), ancestorPageId: optional('ancestorPageId'), label: optional('label'),
      assignee: assignee === 'current-reader' ? { kind: 'current-reader' }
        : assignee ? { kind: 'member', memberId: assignee.slice('member:'.length) } : undefined,
      creatorMemberId: optional('creatorMemberId'), dueFrom: optional('dueFrom'), dueTo: optional('dueTo'),
      state: optional('state'), groupBy: optional('groupBy'), orderBy: optional('orderBy'),
      direction: optional('direction'), limit: Number(data.get('limit')),
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Choose valid report filters.');
    await onSave(parsed.data);
  }}>
    <p>Each reader sees tasks only on published pages they can read. Completing a task requires edit access to its source page.</p>
    {loading ? <p role="status">Loading report choices…</p> : null}
    {failures.length ? <div role="alert"><p>{errorMessage(failures[0])}</p><button type="button" onClick={() => { void navigation.reload(); void sourcePage.reload(); void spaces.reload(); void pages.reload(); void members.reload(); }}>Reload choices</button></div> : null}
    <label>Space<select aria-label="Report space" name="containerId" defaultValue={definition.containerId ?? ''}><option value="">All readable spaces</option>{spaceChoices.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    <label>Under page<select aria-label="Report ancestor page" name="ancestorPageId" defaultValue={definition.ancestorPageId ?? ''}><option value="">Any parent</option>{pageChoices.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    <label>Label<input name="label" maxLength={80} defaultValue={definition.label ?? ''} /></label>
    <label>Assignee<select aria-label="Report assignee" name="assignee" defaultValue={definition.assignee?.kind === 'current-reader' ? 'current-reader' : selectedAssignee ? `member:${selectedAssignee}` : ''}>
      <option value="">Any assignee</option><option value="current-reader">The current reader</option>{savedChoice(people, selectedAssignee).map(item => <option key={item.id} value={`member:${item.id}`}>{item.label}</option>)}
    </select></label>
    <label>Creator<select aria-label="Report creator" name="creatorMemberId" defaultValue={definition.creatorMemberId ?? ''}><option value="">Any creator</option>{savedChoice(people, definition.creatorMemberId).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    <label>Due from<input type="date" name="dueFrom" defaultValue={definition.dueFrom ?? ''} /></label>
    <label>Due through<input type="date" name="dueTo" defaultValue={definition.dueTo ?? ''} /></label>
    <label>State<select aria-label="State" name="state" defaultValue={definition.state ?? ''}><option value="">All tasks</option><option value="open">Open</option><option value="completed">Completed</option></select></label>
    <label>Group by<select aria-label="Group by" name="groupBy" defaultValue={definition.groupBy}><option value="page">Page</option><option value="assignee">Assignee</option><option value="due">Due date</option></select></label>
    <label>Order by<select aria-label="Order by" name="orderBy" defaultValue={definition.orderBy}><option value="due">Due date</option><option value="page">Page</option><option value="assignee">Assignee</option></select></label>
    <label>Direction<select aria-label="Direction" name="direction" defaultValue={definition.direction}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
    <label>Maximum tasks<input type="number" name="limit" min={1} max={100} required defaultValue={definition.limit} /></label>
  </ActionDialog>;
}
