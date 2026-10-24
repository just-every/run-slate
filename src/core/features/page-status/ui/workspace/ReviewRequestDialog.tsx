import { useResource } from '../../../../client/useResource';
import { mutate, operationKey } from '../../../../client/transport';
import { ActionDialog } from '../../../../app/ui/ActionDialog';
import { RequestState } from '../../../../app/ui/RequestState';
import type { ReviewRequestItem, ReviewTarget } from '../../request-types';

export function ReviewRequestDialog({ pageId, pageRevisionId, request, onClose, onSaved }: {
 pageId: string; pageRevisionId: string; request?: ReviewRequestItem; onClose: () => void; onSaved: () => void | Promise<void>;
}) {
 const targets = useResource<{items: ReviewTarget[]}>(`/api/status/requests/page/${encodeURIComponent(pageId)}/targets`);
 const today = new Date(), date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
 return <ActionDialog title={request ? 'Reassign review' : 'Request review'} action={request ? 'Reassign review' : 'Request review'} onClose={onClose} onSubmit={async data => {
  const target = String(data.get('reviewer')), separator = target.indexOf(':');
  if (separator < 0 || targets.loading || targets.error) throw new Error('Choose a reviewer who can already read the page.');
  await mutate(request ? `/api/status/requests/${request.id}/reassign` : `/api/status/requests/page/${pageId}`, {
   operationKey: operationKey(), expectedRevisionId: request?.revisionId ?? pageRevisionId,
   ...(request ? { assignmentGeneration: request.assignmentGeneration } : {}),
   assigneeKind: target.slice(0, separator), assigneeId: target.slice(separator + 1),
   date: String(data.get('date')), time: String(data.get('time')), timezone: String(data.get('timezone')), note: String(data.get('note')),
  });
  await onSaved();
 }}>
  <p>Assignment never grants access. The reviewer must already be able to read this page; verification also requires edit access.</p>
  <p>Suggested expertise is a hint only. Choose the reviewer explicitly.</p>
  <ul aria-label="Suggested experts">{targets.data?.items.filter(t=>t.expertise?.length).map(t=><li key={t.id}>{t.name}: {t.expertise!.join(', ')}</li>)}</ul>
  <RequestState loading={targets.loading} error={targets.error} retry={targets.reload}>
   <label>Reviewer<select aria-label="Reviewer" name="reviewer" required defaultValue={request ? `${request.assigneeKind}:${request.assigneeId}` : ''}>
    <option value="" disabled>Choose a member or group</option>
    {(['member', 'group'] as const).map(kind => <optgroup key={kind} label={kind === 'member' ? 'Members' : 'Groups'}>{targets.data?.items.filter(t => t.kind === kind).map(t => <option key={t.id} value={`${kind}:${t.id}`}>{t.name}</option>)}</optgroup>)}
   </select></label>
  </RequestState>
  <label>Due date<input type="date" name="date" required defaultValue={request?.date ?? date}/></label>
  <label>Due time<input type="time" name="time" required defaultValue={request?.time ?? '17:00'}/></label>
  <label>Timezone<input name="timezone" required defaultValue={request?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}/></label>
  <label>Note<textarea name="note" maxLength={4000} defaultValue={request?.note ?? ''}/></label>
  <p>The reviewer gets one reminder when overdue. If still pending, current container owners get one reminder 24 hours later.</p>
  {request?.dispatchPausedAt ? <p>Reassigning, including to the same reviewer, resumes reminders with a fresh assignment.</p> : null}
 </ActionDialog>;
}
