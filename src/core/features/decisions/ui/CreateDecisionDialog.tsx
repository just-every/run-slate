import {useState} from 'react';
import {ActionDialog} from '../../../app/ui/ActionDialog';
import {useWorkspace} from '../../../app/ui/WorkspaceContext';
import {mutate,operationKey} from '../../../client/transport';
import {DecisionFields,type DecisionDraft} from './DecisionFields';
export function CreateDecisionDialog({pageId,onClose}:{pageId:string;onClose:()=>void}){
 const {member}=useWorkspace();
 const [draft,setDraft]=useState<DecisionDraft>({question:'',options:'',ownerId:member.id,decidedAt:null,reviewAt:null,citations:[]});
 return <ActionDialog title="Add a decision to this page" action="Create proposed decision" onClose={onClose} onSubmit={async data=>{
  const result=await mutate<{value:{id:string}}>('/api/decisions',{operationKey:operationKey(),pageId,...draft,options:draft.options.split('\n').map(value=>value.trim()).filter(Boolean),outcome:String(data.get('outcome')),rationale:String(data.get('rationale'))});
  window.location.assign(`/app/decisions/${result.value.id}`);
 }}><DecisionFields draft={draft} change={setDraft}/><label>Proposed outcome<textarea name="outcome"/></label><label>Rationale<textarea name="rationale"/></label><p>The page keeps its body, comments, versions and access. The appointed owner accepts the decision after review.</p></ActionDialog>;
}
