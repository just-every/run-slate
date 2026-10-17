import { richTextToPlain } from '../../editor/ui/types';
import type { TaskItem } from './taskTypes';
export function TaskListRows({items,pending,onComplete}:{items:TaskItem[];pending:string|null;onComplete:(task:TaskItem)=>void}) {
  const today=new Date();today.setHours(0,0,0,0);
  return <ul className="task-list">{items.map(task=>{
    const text=richTextToPlain(task.text),due=task.dueDate?new Date(`${task.dueDate}T00:00:00`):null;
    return <li key={`${task.pageId}:${task.blockId}`}>
      <input type="checkbox" aria-label={`Complete: ${text}`} checked={task.done} disabled={!task.canEdit||pending===task.blockId} onChange={()=>onComplete(task)}/>
      <div><a className={task.done?'task-completed':undefined} href={`/app/pages/${task.pageId}#block-${task.blockId}`}>{text||'Untitled task'}</a><p><a href={`/app/pages/${task.pageId}`}>{task.pageTitle}</a><span> · {task.containerName}</span></p></div>
      {due?<time dateTime={task.dueDate!} className={!task.done&&due<today?'task-overdue':undefined}>{!task.done&&due<today?'Overdue · ':''}{due.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</time>:<span className="muted">No due date</span>}
    </li>;
  })}</ul>;
}
