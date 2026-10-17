import { ActionDialog } from '../../../../app/ui/ActionDialog';
import { useWorkspace } from '../../../../app/ui/WorkspaceContext';
import { mutate, operationKey } from '../../../../client/transport';

export function ReminderDialog({pageId,blockId,date,onClose}:{pageId:string;blockId?:string;date?:string;onClose:()=>void}) {
  const {navigation}=useWorkspace();
  const timezone=navigation.data?.preferences.value.timezone??'UTC';
  return <ActionDialog title="Remind me" action="Set reminder" onClose={onClose} onSubmit={async form=>{
    await mutate('/api/reminders',{operationKey:operationKey(),pageId,blockId: blockId??null,date:String(form.get('date')),time:String(form.get('time')),timezone:String(form.get('timezone')),offsetMinutes:Number(form.get('offsetMinutes'))});
    window.dispatchEvent(new Event('slate:reminders-changed'));
  }}>
    <p>A private inbox reminder, delivered once while you can read this page.</p>
    <label>Date<input type="date" name="date" defaultValue={date} required/></label>
    <label>Local time<input type="time" name="time" defaultValue="09:00" required/></label>
    <label>Time zone<input name="timezone" defaultValue={timezone} required/></label>
    <label>Remind<select name="offsetMinutes" defaultValue="0"><option value="0">At this time</option><option value="60">1 hour before</option><option value="1440">1 day before</option><option value="10080">1 week before</option></select></label>
  </ActionDialog>;
}
