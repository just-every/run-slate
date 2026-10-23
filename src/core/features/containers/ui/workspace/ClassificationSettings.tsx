import {useState} from 'react';
import {useResource} from '../../../../client/useResource';
import {useWorkspace} from '../../../../app/ui/WorkspaceContext';
import {mutate,operationKey} from '../../../../client/transport';
import {ActionDialog} from '../../../../app/ui/ActionDialog';
import {RequestState} from '../../../../app/ui/RequestState';
export function ClassificationSettings({id,onSaved}:{id:string;onSaved:()=>void}){
 const {member}=useWorkspace(),resource=useResource<{revisionId:string|null;label:'none'|'Confidential';allowAi:boolean}>(`/api/containers/${encodeURIComponent(id)}/classification`);
 const [editing,setEditing]=useState(false);
 return <section aria-label="Space classification"><h4>Classification</h4><RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>{resource.data?<><p>{resource.data.label}</p><p>Confidential stops existing public links and forbids assistance by default. Only a workspace owner can change the label or lift these defaults.</p>{member.role==='owner'?<button className="secondary-button" onClick={()=>setEditing(true)}>Change classification</button>:null}</>:null}</RequestState>
 {editing&&resource.data?<ActionDialog title="Space classification" action="Save classification" onClose={()=>setEditing(false)} onSubmit={async form=>{await mutate(`/api/containers/${encodeURIComponent(id)}/classification`,{operationKey:operationKey(),expectedRevisionId:resource.data!.revisionId,label:String(form.get('label')),allowAi:form.has('allowAi')},'PUT');await resource.reload();onSaved();}}>
 <label>Classification<select name="label" defaultValue={resource.data.label}><option value="none">None</option><option value="Confidential">Confidential</option></select></label>
 <label><input type="checkbox" name="allowAi" defaultChecked={resource.data.allowAi}/>Allow assistance for this space</label>
 <p>Applying Confidential stops public links immediately. Clearing the label does not reopen links. An owner can explicitly lift public access in Space access.</p>
 </ActionDialog>:null}</section>;
}
