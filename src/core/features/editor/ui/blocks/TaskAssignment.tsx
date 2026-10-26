import { useRef, useState } from 'react';
import { ActionDialog } from '../../../../app/ui/ActionDialog';
import { mutate, operationKey, request, errorMessage } from '../../../../client/transport';
import { useTaskPage, type TaskPerson } from './TaskPageContext';
import type { TaskBlockData, RichText } from '../types';

export function useTaskAssignment(block:TaskBlockData,onChange:(next:TaskBlockData)=>void) {
  const page=useTaskPage();
  const latest=useRef({block,onChange});
  latest.current={block,onChange};
  const [pending,setPending]=useState<{person:TaskPerson}|null>(null);
  const [error,setError]=useState<unknown>();
  function update(patch:Partial<TaskBlockData>){
    const next={...latest.current.block,...patch};
    latest.current={...latest.current,block:next};
    latest.current.onChange(next);
  }
  async function choose(id:string|null) {
    setError(undefined);
    const people=id&&page?(await request<{items:TaskPerson[]}>(`/api/tasks/${encodeURIComponent(page.pageId)}/assignees`)).items:page?.people;
    const person=people?.find(item=>item.id===id);
    if(person&&!person.canRead){setPending({person});return;}
    update({assigneeMemberId:id});
  }
  function assign(id:string|null,text?:RichText){
    // Mention insertion must render while EditableElement still owns its caret.
    // The assignee lookup may finish after the author has continued typing.
    if(text)update({text});
    void choose(id).catch(setError);
  }
  const prompt=<>{error?<p role="alert">{errorMessage(error)}</p>:null}{pending?<ActionDialog title="Share before assigning" action="Share page and assign" onClose={()=>setPending(null)} onSubmit={async()=>{
    if(!page?.canShare)throw new Error('Ask someone with full access to share this page before assigning the task.');
    await mutate('/api/sharing',{operationKey:operationKey(),targetKind:'page',targetId:page.pageId,principalKind:'member',principalId:pending.person.id,level:'edit'});
    await page.reload();
    update({assigneeMemberId:pending.person.id});
  }}><p>{pending.person.displayName} cannot read this page. Share it with edit access so they can see and complete the task, or cancel.</p>{!page?.canShare?<p>You need full access to share this page.</p>:null}</ActionDialog>:null}</>;
  return {page,assign,prompt,update};
}
