import { useState } from 'react';
import { TopBar } from '../../../app/ui/header/TopBar';
import { PageTitle } from '../../../app/ui/header/PageTitle';
import { RequestState } from '../../../app/ui/RequestState';
import { useResource } from '../../../client/useResource';
import { useWorkspace } from '../../../app/ui/WorkspaceContext';
import { mutate, operationKey, errorMessage } from '../../../client/transport';
import { TaskListRows } from './TaskListRows';
import { PersonalReminders } from './PersonalReminders';
import type { TaskItem, TaskList } from './taskTypes';

export function MyTasks() {
  const {navigation}=useWorkspace();
  const [tab,setTab]=useState('assigned'),[state,setState]=useState('open'),[container,setContainer]=useState(''),[sort,setSort]=useState('due');
  const [from,setFrom]=useState(''),[to,setTo]=useState(''),[cursor,setCursor]=useState<string>();
  const [pending,setPending]=useState<string|null>(null),[error,setError]=useState<unknown>();
  const query=new URLSearchParams({tab,state,sort});
  if(container)query.set('containerId',container);if(from)query.set('dueFrom',from);if(to)query.set('dueTo',to);if(cursor)query.set('cursor',cursor);
  const resource=useResource<TaskList>(`/api/tasks?${query}`);
  function change(set:(value:string)=>void,value:string){set(value);setCursor(undefined);}
  async function complete(task:TaskItem){setPending(task.blockId);setError(undefined);try{await mutate(`/api/tasks/${task.pageId}/${task.blockId}`,{operationKey:operationKey(),expectedRevisionId:task.blockRevisionId,done:!task.done},'PATCH');await resource.reload();}catch(cause){setError(cause);}finally{setPending(null);}}
  return <><TopBar trail={[{label:'My tasks'}]}/><section className="main"><PageTitle>My tasks</PageTitle><p className="page-lede">Follow through on the work in your pages.</p>
    <div className="tabs" role="tablist" aria-label="Task ownership">{[['assigned','Assigned to me'],['created','Created by me']].map(([value,label])=><button key={value} type="button" role="tab" aria-selected={tab===value} onClick={()=>change(setTab,value)}>{label}</button>)}</div>
    <div className="task-filters">
      <label>State<select value={state} onChange={event=>change(setState,event.target.value)}><option value="open">Open</option><option value="completed">Completed</option><option value="overdue">Overdue</option><option value="">All tasks</option></select></label>
      <label>Space<select value={container} onChange={event=>change(setContainer,event.target.value)}><option value="">Every space</option>{navigation.data?.containers.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Due from<input type="date" value={from} onChange={event=>change(setFrom,event.target.value)}/></label><label>Due through<input type="date" value={to} onChange={event=>change(setTo,event.target.value)}/></label>
      <label>Sort<select value={sort} onChange={event=>change(setSort,event.target.value)}><option value="due">Due date</option><option value="page">Page</option><option value="container">Space</option></select></label>
    </div>
    {error?<p role="alert">{errorMessage(error)}</p>:null}<RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
      <TaskListRows items={resource.data?.items??[]} pending={pending} onComplete={task=>void complete(task)}/>
      {resource.data?.items.length===0?<div className="empty-start"><h2>No tasks in this view</h2><p>Assign a to-do on a page, or change your filters.</p></div>:null}
      <div className="editor-actions">{cursor?<button type="button" onClick={()=>setCursor(undefined)}>First page</button>:null}{resource.data?.nextCursor?<button type="button" onClick={()=>setCursor(resource.data!.nextCursor)}>More tasks →</button>:null}</div>
    </RequestState><PersonalReminders/>
  </section></>;
}
