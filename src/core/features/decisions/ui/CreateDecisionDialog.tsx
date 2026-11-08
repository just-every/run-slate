import {useState} from 'react';
import {ActionDialog} from '../../../app/ui/ActionDialog';
import {useWorkspace} from '../../../app/ui/WorkspaceContext';
import {mutate,operationKey} from '../../../client/transport';
import {useResource} from '../../../client/useResource';
import {RequestState} from '../../../app/ui/RequestState';
import {DecisionFields,type DecisionDraft} from './DecisionFields';
export function CreateDecisionDialog({pageId,onClose}:{pageId:string;onClose:()=>void}){
 const {member}=useWorkspace();
 const active=useResource<{items:{id:string;question:string}[]}>(`/api/decisions?pageId=${encodeURIComponent(pageId)}`);
 const existing=active.data?.items[0];
 const [draft,setDraft]=useState<DecisionDraft>({question:'',options:'',ownerId:member.id,decidedAt:null,reviewAt:null,citations:[]});
 return <ActionDialog title="Add a decision to this page" action="Create proposed decision" submitDisabled={!active.data || !!active.error || !!existing} onClose={onClose} onSubmit={async data=>{
  if(!active.data||existing)return false;
  const result=await mutate<{value:{id:string}}>('/api/decisions',{operationKey:operationKey(),pageId,...draft,options:draft.options.split('\n').map(value=>value.trim()).filter(Boolean),outcome:String(data.get('outcome')),rationale:String(data.get('rationale'))});
  window.location.assign(`/app/decisions/${result.value.id}`);
 }}><RequestState loading={active.loading} error={active.error} retry={active.reload}>
 {existing ? <p role="alert">This page already has a decision record. <a href={`/app/decisions/${existing.id}`}>Open {existing.question}</a> or remove its layer before adding another.</p> : null}
 </RequestState><DecisionFields draft={draft} change={setDraft}/><label>Proposed outcome<textarea name="outcome"/></label><label>Rationale<textarea name="rationale"/></label><p>The page keeps its body, comments, versions and access. The appointed owner accepts the decision after review.</p></ActionDialog>;
}
