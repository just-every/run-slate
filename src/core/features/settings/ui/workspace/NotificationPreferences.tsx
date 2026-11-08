import {useState} from 'react';
import {useResource} from '../../../../client/useResource';
import {mutate,operationKey,errorMessage} from '../../../../client/transport';
import {RequestState} from '../../../../app/ui/RequestState';
type Mode='default'|'in-app'|'immediate'|'daily'|'weekly';
interface Settings {items:{event:string;mode:Mode}[];sectionNames:boolean;canManage:boolean}
/** Use the existing Settings form language; these choices apply only to the current member. */
export function NotificationPreferences(){
 const resource=useResource<Settings>('/api/notifications/preferences');
 const [pending,setPending]=useState(false),[error,setError]=useState<unknown>(),[notice,setNotice]=useState('');
 const [sectionNames,setSectionNames]=useState<boolean|null>(null),[choices,setChoices]=useState<Record<string,Mode>>({});
 async function save(path:string,value:Record<string,unknown>){setPending(true);setError(undefined);setNotice('');try{await mutate(path,{operationKey:operationKey(),...value},'PUT');if(!await resource.reload())throw new Error('Saved, but preferences could not be reloaded. Try again.');setNotice('Notification preferences saved.');}catch(cause){setError(cause);}finally{setPending(false);setSectionNames(null);setChoices({});}}
 return <section className="settings-panel" aria-label="Notification preferences"><h3>Email notifications</h3>
 <p>Your inbox always receives notifications. Choose email for the events you want. Keeping the default currently means in-app only. Digests arrive at 09:00 in your timezone; weekly digests arrive on Monday. Reminders keep their chosen local time.</p>
 <RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
 <fieldset disabled={pending} style={{minWidth:0}}><legend>Your delivery choices</legend>
 {resource.data?.items.map(item=><label key={item.event}>{item.event.replaceAll('-',' ')}<select aria-label={`${item.event.replaceAll('-',' ')} delivery`} value={choices[item.event]??item.mode} onChange={event=>{const mode=event.target.value as Mode;setChoices({[item.event]:mode});void save('/api/notifications/preferences',{event:item.event,mode});}}>
 <option value="default">Keep the default (in-app only)</option><option value="in-app">In-app only</option><option value="immediate">Immediate email</option><option value="daily">Daily digest</option><option value="weekly">Weekly digest</option>
 </select></label>)}
 </fieldset>
 {resource.data?.canManage?<fieldset disabled={pending}><legend>Workspace notification privacy</legend><label><input type="checkbox" checked={sectionNames??resource.data.sectionNames} onChange={event=>{setSectionNames(event.target.checked);void save('/api/notifications/email-settings',{sectionNames:event.target.checked});}}/>Section names in notifications</label><p>Off by default. When enabled, watched-change summaries can name headings. Emails never include block or comment text.</p></fieldset>:null}
 </RequestState>{notice?<p role="status">{notice}</p>:null}{error?<p role="alert">{errorMessage(error)}</p>:null}
 </section>;
}
