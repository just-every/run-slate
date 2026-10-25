import { DateStamp } from "../../../../app/ui/displayDate";
import { useState } from 'react';
import { mutate, operationKey } from '../../../../client/transport';
import { ActionDialog } from '../../../../app/ui/ActionDialog';
import type { ReviewRequestItem } from '../../request-types';
import { ReviewRequestDialog } from './ReviewRequestDialog';
import { VerifyDialog } from './VerifyDialog';

export function ReviewRequestList({ items, onSaved }: { items: ReviewRequestItem[]; onSaved: () => void | Promise<void> }) {
 const [action, setAction] = useState<{kind: 'reassign' | 'changes' | 'cancel' | 'verify'; item: ReviewRequestItem}>();
 const close = () => setAction(undefined);
 return <>
  <ul className="archive-list review-list">
   {items.map(item => <li key={item.id} data-state={item.state}>
    <div>
     <h3><a href={`/app/pages/${encodeURIComponent(item.pageId)}?detail=status`}>{item.title}</a></h3>
     <p>{item.state === 'pending' ? 'Awaiting review' : item.state === 'changes_requested' ? 'Changes requested' : item.state === 'verified' ? 'Verified' : 'Cancelled'} · {item.assigneeName}{item.assigneeKind === 'group' ? ' (group)' : ''} · Requested by {item.requesterName}</p>
     <p>Due <DateStamp value={item.date} /> at {item.time} ({item.timezone}){item.containerName ? ` · ${item.containerName}` : ''}</p>
     {item.note ? <p style={{whiteSpace: 'pre-wrap'}}>{item.note}</p> : null}
     {item.state === 'pending' ? <p className="muted">{item.dispatchPausedAt ? 'Reminders paused after restore. Reassign to resume.' : item.reviewerRemindedAt ? <>Reviewer reminded <DateStamp value={item.reviewerRemindedAt} />. {item.ownerRemindedAt ? <>Container owners reminded <DateStamp value={item.ownerRemindedAt} />.</> : <>Container owners will be reminded after <DateStamp value={item.ownerReminderAt} /> if still pending.</>}</> : 'One overdue reminder goes to the reviewer, then one to current container owners 24 hours later if still pending.'}</p> : null}
    </div>
    {item.state === 'pending' ? <div className="editor-actions">
     <a className="secondary-button" href={`/app/pages/${encodeURIComponent(item.pageId)}?detail=status`}>Open current revision</a>
     {item.canVerify ? <button type="button" onClick={() => setAction({kind: 'verify', item})}>Verify review</button> : null}
     {item.canRequestChanges ? <button type="button" onClick={() => setAction({kind: 'changes', item})}>Request changes</button> : null}
     {item.canReassign ? <button type="button" onClick={() => setAction({kind: 'reassign', item})}>{item.dispatchPausedAt ? 'Reassign and resume' : 'Reassign'}</button> : null}
     {item.canCancel ? <button type="button" onClick={() => setAction({kind: 'cancel', item})}>Cancel review</button> : null}
    </div> : null}
   </li>)}
  </ul>
  {action?.kind === 'reassign' ? <ReviewRequestDialog pageId={action.item.pageId} pageRevisionId={action.item.pageRevisionId} request={action.item} onClose={close} onSaved={onSaved}/> : null}
  {action?.kind === 'verify' && action.item.statusKey ? <VerifyDialog pageId={action.item.pageId} statusKey={action.item.statusKey} expectedRevisionId={action.item.pageRevisionId} attestRevisionId={action.item.workingRevisionId} openedCurrent={action.item.openedCurrent} reviewRequest={{id: action.item.id, assignmentGeneration: action.item.assignmentGeneration, expectedRevisionId: action.item.revisionId}} onClose={close} onVerified={onSaved}/> : null}
  {action?.kind === 'changes' || action?.kind === 'cancel' ? <ActionDialog title={action.kind === 'changes' ? 'Request changes' : 'Cancel review request'} action={action.kind === 'changes' ? 'Post comment and request changes' : 'Cancel review'} onClose={close} onSubmit={async data => {
   await mutate(`/api/status/requests/${action.item.id}/${action.kind === 'changes' ? 'changes' : 'cancel'}`, { operationKey: operationKey(), expectedRevisionId: action.item.revisionId, assignmentGeneration: action.item.assignmentGeneration, ...(action.kind === 'changes' ? {note: String(data.get('note'))} : {}) });
   await onSaved();
  }}>{action.kind === 'changes' ? <label>Requested changes<textarea name="note" required maxLength={4000}/></label> : <p>Cancel the pending request for {action.item.assigneeName} and stop its reminders.</p>}</ActionDialog> : null}
 </>;
}
