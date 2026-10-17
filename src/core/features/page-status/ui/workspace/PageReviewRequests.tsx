import { useEffect, useState } from 'react';
import { useResource } from '../../../../client/useResource';
import { RequestState } from '../../../../app/ui/RequestState';
import type { ReviewRequestQueue } from '../../request-types';
import { ReviewRequestList } from './ReviewRequestList';
import { ReviewRequestDialog } from './ReviewRequestDialog';
import { reviewChanged } from './ReviewQueue';

export function PageReviewRequests({ pageId, pageRevisionId, onSaved }: {pageId: string; pageRevisionId: string; onSaved: () => void | Promise<void>}) {
 const resource = useResource<ReviewRequestQueue & {canRequest: boolean}>(`/api/status/requests/page/${encodeURIComponent(pageId)}`);
 const [requesting, setRequesting] = useState(false);
 const saved = async () => { await resource.reload(); await onSaved(); reviewChanged(); };
 useEffect(() => {
  const opened = () => { void resource.reload(); };
  window.addEventListener('slate:page-opened', opened);
  return () => window.removeEventListener('slate:page-opened', opened);
 }, [resource.reload]);
 return <section aria-label="Page review requests">
  <h3>Review requests</h3>
  <RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
   {resource.data?.canRequest ? <button type="button" onClick={() => setRequesting(true)}>Request review</button> : null}
   {resource.data?.items.length ? <ReviewRequestList items={resource.data.items} onSaved={saved}/> : <p>No review requests for this page.</p>}
   {resource.data?.nextCursor ? <a href="/app/review">See all in Needs review</a> : null}
  </RequestState>
  {requesting ? <ReviewRequestDialog pageId={pageId} pageRevisionId={pageRevisionId} onClose={() => setRequesting(false)} onSaved={saved}/> : null}
 </section>;
}
