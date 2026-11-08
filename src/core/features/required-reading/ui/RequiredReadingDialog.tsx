import {useState} from 'react';
import {ActionDialog} from '../../../app/ui/ActionDialog';
import {RequestState} from '../../../app/ui/RequestState';
import {displayDate} from '../../../app/ui/displayDate';
import {useResource} from '../../../client/useResource';
import {mutate,operationKey} from '../../../client/transport';
interface Member {memberId:string;displayName:string}
interface Report {id:string;createdAt:string;reminderDays:number;dueAt:string;cancelledAt:string|null;members:(Member&{state:string;acknowledgedAt:string|null;remindedAt:string|null})[]}
export function RequiredReadingDialog({pageId,onClose}:{pageId:string;onClose:()=>void}){
 const groups=useResource<{items:{id:string;name:string}[]}>('/api/groups');
 const reports=useResource<{items:Report[]}>(`/api/required-reading/page/${encodeURIComponent(pageId)}`);
 const [groupId,setGroupId]=useState('');
 const preview=useResource<{readers:Member[];excluded:Member[]}>(groupId?`/api/required-reading/preview?pageId=${encodeURIComponent(pageId)}&groupId=${encodeURIComponent(groupId)}`:null);
 const [key,setKey]=useState(operationKey);
 return <ActionDialog title="Required reading" action="Send required reading" onClose={onClose} submitDisabled={!groupId||preview.loading||!!preview.error||!preview.data} onSubmit={async form=>{
  await mutate('/api/required-reading',{operationKey:key,pageId,groupId,reminderDays:Number(form.get('reminderDays'))});
  setKey(operationKey());reports.reload();return false;
 }}>
  <p>Send one inbox item to each active group member who can read this page. Unacknowledged readers receive one reminder.</p>
  <RequestState loading={groups.loading} error={groups.error} retry={groups.reload}>
   <label>Group<select name="groupId" value={groupId} onChange={e=>{setGroupId(e.target.value);setKey(operationKey());}} required><option value="">Choose a group</option>{groups.data?.items.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
   <label>Remind after days<input name="reminderDays" type="number" min="1" max="365" defaultValue="7" required onChange={()=>setKey(operationKey())}/></label>
  </RequestState>
  {groupId?<RequestState loading={preview.loading} error={preview.error} retry={preview.reload}>
   <p>{preview.data?.readers.length??0} readers will receive an inbox item.</p>
   {preview.data?.excluded.length?<section aria-label="Members who cannot read"><h3>Cannot read this page</h3><ul>{preview.data.excluded.map(m=><li key={m.memberId}>{m.displayName} — no notification</li>)}</ul></section>:null}
  </RequestState>:null}
  <section aria-label="Required reading reports"><h3>Private reports</h3><p>Only the sender and workspace owners with page access can see these acknowledgments. No reading time, scroll depth or view data is collected here.</p>
   <RequestState loading={reports.loading} error={reports.error} retry={reports.reload}>
    {reports.data?.items.map(r=><section key={r.id} aria-label={`Reading sent ${r.id}`}><h4>Sent {displayDate(r.createdAt,true)}</h4><p>Reminder after {r.reminderDays} days{r.cancelledAt?' · Future reminders cancelled':''}</p><ul className="outcome-list">{r.members.map(m=><li key={m.memberId}><h3>{m.displayName}</h3><p>{m.state==='cannot-read'?'Cannot read — not notified':m.state==='acknowledged'?`Acknowledged · ${displayDate(m.acknowledgedAt!,true)}`:m.state==='reminded'?`Reminded · ${displayDate(m.remindedAt!,true)}`:'Pending'}</p></li>)}</ul></section>)}
    {reports.data?.items.length===0?<p>No required reading sent yet.</p>:null}
   </RequestState>
  </section>
 </ActionDialog>;
}
