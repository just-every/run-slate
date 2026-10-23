import {useState} from 'react';
import {useResource} from '../../../../client/useResource';
import {mutate,operationKey} from '../../../../client/transport';
import {RequestState} from '../../../../app/ui/RequestState';
import {ActionDialog} from '../../../../app/ui/ActionDialog';
import type {Governance} from '../../../workspace/governance';
const capabilities=[['createContainers','Create spaces'],['publishPublicly','Publish publicly'],['inviteGuests','Invite guests'],['export','Export content'],['useAi','Use assistance']] as const;
export function GovernanceSettings(){
 const resource=useResource<{revisionId:string|null;rules:Governance}>('/api/workspace/governance');
 const [editing,setEditing]=useState(false);
 return <section aria-label="Content governance"><h3>Content governance</h3><p>Role limits add to page and space permissions. Guests are excluded once these rules are saved. Admin currently admits owners only.</p>
  <RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>{resource.data?<><dl className="settings-facts">{capabilities.map(([id,label])=><div key={id}><dt>{label}</dt><dd>{resource.data!.rules[id]}</dd></div>)}</dl><button className="secondary-button" onClick={()=>setEditing(true)}>Edit content governance</button></>:null}</RequestState>
  {editing&&resource.data?<ActionDialog title="Content governance" action="Save governance" onClose={()=>setEditing(false)} onSubmit={async form=>{
   await mutate('/api/workspace/governance',{operationKey:operationKey(),expectedRevisionId:resource.data!.revisionId,rules:Object.fromEntries(capabilities.map(([id])=>[id,String(form.get(id))]))},'PUT');await resource.reload();
  }}>{capabilities.map(([id,label])=><label key={id}>{label}<select name={id} defaultValue={resource.data!.rules[id]}><option value="member">Members</option><option value="admin">Admins and owners</option><option value="owner">Owners</option></select></label>)}<p>Every change is recorded in activity. No permission is granted by these settings.</p></ActionDialog>:null}
 </section>;
}
