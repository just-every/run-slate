import { useState } from 'react';
import { ActionDialog } from '../../../../app/ui/ActionDialog';
import { mutate, operationKey } from '../../../../client/transport';
import type { ReviewItem } from '../../review';
export function BulkVerifyDialog({ items, onClose, onSaved }: {items: ReviewItem[]; onClose: () => void; onSaved: () => void | Promise<void>}) {
 const [results, setResults] = useState<{pageId: string; verified: boolean; message?: string}[]>();
 return <ActionDialog title="Verify opened revisions" action={results ? 'Done' : 'I reviewed every selected revision'} onClose={onClose} onSubmit={async () => {
  if (results) return;
  const response = await mutate<{items: {pageId: string; verified: boolean; message?: string}[]}>('/api/status/review/bulk-verify', { items: items.map(item => ({pageId: item.pageId, operationKey: operationKey(), pageRevisionId: item.pageRevisionId, attestRevisionId: item.workingRevisionId, statusKey: item.statusKey, expiresInDays: 90})) });
  setResults(response.items);
  await onSaved();
  return false;
 }}>
  <p>You confirm that you opened, read and checked each exact revision below. Each verification expires in 90 days. A page changed since you opened it must be opened and reviewed again.</p>
  <ul>{items.map(item => <li key={item.pageId}><a href={item.reviewHref} target="_blank" rel="noreferrer">{item.title}</a></li>)}</ul>
  {results ? <ul aria-live="polite">{results.map(r => <li key={r.pageId}>{items.find(i => i.pageId === r.pageId)?.title}: {r.verified ? 'Verified' : r.message}</li>)}</ul> : null}
 </ActionDialog>;
}
