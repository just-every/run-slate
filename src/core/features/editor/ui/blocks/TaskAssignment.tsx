import { useState } from 'react';
import { ActionDialog } from '../../../../app/ui/ActionDialog';
import { mutate, operationKey, request, errorMessage } from '../../../../client/transport';
import { useTaskPage, type TaskPerson } from './TaskPageContext';
import type { TaskBlockData, RichText } from '../types';

export function useTaskAssignment(block:TaskBlockData,onChange:(next:TaskBlockData)=>void) {
  const page=useTaskPage();
  const [pending,setPending]=useState<{person:TaskPerson;text:RichText}|null>(null);
  const [error,setError]=useState<unknown>();
  async function choose(id:string|null,text:RichText) {
    setError(undefined);
    const people=id&&page?(await request<{items:TaskPerson[]}>(`/api/tasks/${encodeURIComponent(page.pageId)}/assignees`)).items:page?.people;
    const person=people?.find(item=>item.id===id);
    if(person&&!person.canRead){setPending({person,text});return;}
    onChange({...block,text,assigneeMemberId:id});
  }
  function assign(id:string|null,text=block.text){void choose(id,text).catch(setError);}
  const prompt=<>{error?<p role="alert">{errorMessage(error)}</p>:null}{pending?<ActionDialog title="Share before assigning" action="Share page and assign" onClose={()=>setPending(null)} onSubmit={async()=>{
    if(!page?.canShare)throw new Error('Ask someone with full access to share this page before assigning the task.');
    await mutate('/api/sharing',{operationKey:operationKey(),targetKind:'page',targetId:page.pageId,principalKind:'member',principalId:pending.person.id,level:'edit'});
    await page.reload();
    onChange({...block,text:pending.text,assigneeMemberId:pending.person.id});
  }}><p>{pending.person.displayName} cannot read this page. Share it with edit access so they can see and complete the task, or cancel.</p>{!page?.canShare?<p>You need full access to share this page.</p>:null}</ActionDialog>:null}</>;
  return {page,assign,prompt};
}
