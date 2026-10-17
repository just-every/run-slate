import { useEffect, useState } from 'react';
import { Pencil, RefreshCw } from 'lucide-react';
import { Button } from '../../../../ui';
import { ApiError, errorMessage, mutate, operationKey } from '../../../../client/transport';
import type { BlockRenderProps, TaskReportBlockData } from '../types';
import { TaskReportDialog } from '../../../pages/ui/workspace/TaskReportDialog';
import { TaskListRows } from '../../../work-items/ui/TaskListRows';
import type { TaskItem } from '../../../work-items/ui/taskTypes';
import type { TaskReportDefinition } from '../../../work-items/report-definition';
import type { TaskReportResult } from '../../../work-items/report-types';
import { useTaskPage } from './TaskPageContext';

function describeReport(definition: TaskReportDefinition) {
  return [
    definition.containerId ? 'Selected space' : 'All readable spaces',
    definition.ancestorPageId ? 'under a selected page' : null,
    definition.label ? `label ${definition.label}` : null,
    definition.assignee?.kind === 'current-reader' ? 'assigned to the current reader'
      : definition.assignee ? 'selected assignee' : null,
    definition.creatorMemberId ? 'selected creator' : null,
    definition.state ?? 'all states',
    definition.dueFrom ? `due from ${definition.dueFrom}` : null,
    definition.dueTo ? `due through ${definition.dueTo}` : null,
    `grouped by ${definition.groupBy === 'due' ? 'due date' : definition.groupBy}`,
    `ordered by ${definition.orderBy === 'due' ? 'due date' : definition.orderBy} ${definition.direction === 'desc' ? 'descending' : 'ascending'}`,
    `up to ${definition.limit} tasks`,
  ].filter(Boolean).join(' · ');
}

/** Hydrated results stay in this component; onChange receives only the saved criteria. */
export function TaskReportBlock({ block, canEdit, onChange }: BlockRenderProps<TaskReportBlockData>) {
  const page = useTaskPage();
  const [editing, setEditing] = useState(false), [generation, setGeneration] = useState(0);
  const [pending, setPending] = useState<string | null>(null), [completionError, setCompletionError] = useState<unknown>();
  const definition = JSON.stringify(block.definition), pageId = page?.pageId;
  const key = `${pageId ?? ''}:${definition}:${generation}`;
  const [run, setRun] = useState<{ key: string; result?: TaskReportResult; error?: unknown; loading: boolean }>({ key, loading: !!pageId });
  const [lastRun, setLastRun] = useState<{ definition: string; pageId: string; at: string }>();
  useEffect(() => {
    if (!pageId) return;
    const controller = new AbortController();
    setRun({ key, loading: true });
    void mutate<TaskReportResult>(`/api/pages/${encodeURIComponent(pageId)}/task-report`, JSON.parse(definition), 'POST', controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        setRun({ key, result, loading: false });
        setLastRun({ definition, pageId, at: result.ranAt });
      }).catch(error => {
        if (!controller.signal.aborted) setRun({ key, error, loading: false });
      });
    return () => controller.abort();
  }, [pageId, definition, generation, key]);
  const current: typeof run = run.key === key ? run : { key, loading: !!pageId };
  const ranAt = lastRun?.definition === definition && lastRun.pageId === pageId ? lastRun.at : undefined;
  const unavailable = current.error instanceof ApiError && current.error.code === 'TASK_REPORT_SOURCE_UNAVAILABLE';
  async function complete(task: TaskItem) {
    setPending(task.blockId); setCompletionError(undefined);
    try {
      await mutate(`/api/tasks/${encodeURIComponent(task.pageId)}/${encodeURIComponent(task.blockId)}`, {
        operationKey: operationKey(), expectedRevisionId: task.blockRevisionId, done: !task.done,
      }, 'PATCH');
      setGeneration(value => value + 1);
    } catch (error) { setCompletionError(error); }
    finally { setPending(null); }
  }
  return <section aria-label="Task report" className="my-2 min-w-0 rounded-card border border-line" data-task-report>
    <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
      <div className="min-w-0 basis-full sm:basis-0 sm:flex-1"><p className="text-ui font-medium">Task report</p><p className="break-words text-small text-ink-muted">{describeReport(block.definition)}</p></div>
      {canEdit && page ? <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil aria-hidden="true" className="size-3.5" />Edit report</Button> : null}
      {page ? <Button type="button" size="sm" variant="ghost" disabled={current.loading} onClick={() => { setCompletionError(undefined); setGeneration(value => value + 1); }}><RefreshCw aria-hidden="true" className="size-3.5" />Run report</Button> : null}
    </header>
    <div className="min-w-0 px-3 py-2" aria-busy={current.loading}>
      {!page ? <p className="text-small text-ink-muted">This report runs when the template is used on a page. Its definition is saved; results depend on each reader’s access.</p>
        : current.loading ? <p role="status">Running task report…</p>
          : current.error ? <p role="alert">{unavailable ? 'The task report source is unavailable. It may have been deleted or your access may have changed.' : errorMessage(current.error)}</p>
            : current.result?.items.length === 0 ? <p role="status">No tasks match this report.</p>
              : current.result?.groups.map(group => <div key={group.key} className="min-w-0 py-2">
                <h3 className="break-words text-small font-medium">{block.definition.groupBy === 'due' && /^\d{4}-\d{2}-\d{2}$/.test(group.label)
                  ? <time dateTime={group.label}>{new Date(`${group.label}T00:00:00`).toLocaleDateString()}</time> : group.label}</h3>
                <TaskListRows items={group.items} pending={pending} onComplete={task => void complete(task)} />
              </div>)}
      {completionError ? <p role="alert">{errorMessage(completionError)}</p> : null}
    </div>
    <footer className="border-t border-line px-3 py-1.5 text-tiny text-ink-faint">{ranAt ? <>Last ran <time dateTime={ranAt}>{new Date(ranAt).toLocaleString()}</time></> : page ? 'Not run yet' : 'Runs on page open'}</footer>
    {editing && canEdit && page ? <TaskReportDialog pageId={page.pageId} definition={block.definition}
      onSave={async next => { onChange({ ...block, definition: next }); }} onClose={() => setEditing(false)} /> : null}
  </section>;
}
