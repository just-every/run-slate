import { useState } from 'react';
import seed from '../../../../../seed.json';
import type { MemberView } from '../../../shared/api/workspace';
import { mutate, operationKey, errorMessage } from '../../../client/transport';

type Review = { memberIds: string[]; message: string; operationKey: string; items: { id: string; displayName: string; readable: boolean }[] };
export function ShareMessage({ pageId, members, senderId, onSent }: { pageId: string; members: MemberView[]; senderId: string; onSent: () => void }) {
  const [review, setReview] = useState<Review>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const [sent, setSent] = useState(false);
  const missing = review?.items.filter(item => !item.readable) ?? [];
  return <section aria-label="Send a page"><h3>Send a page</h3>
    <p>Send to existing workspace members. Review any new View access before sending.</p>
    <form className="detail-form" onSubmit={async event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const input = { memberIds: data.getAll('memberIds').map(String), message: String(data.get('message') ?? '') };
      setPending(true); setError(undefined); setSent(false);
      try {
        const value = await mutate<{ items: Review['items'] }>(`/api/sharing/pages/${pageId}/message-preview`, input);
        setReview({ ...input, ...value, operationKey: operationKey() });
      } catch (cause) { setError(cause); }
      finally { setPending(false); }
    }}>
      <fieldset disabled={pending || !!review}>
        <legend>Recipients</legend>
        {members.filter(member => member.id !== senderId && member.memberKind === 'member').map(member => <label key={member.id} className="checkbox-label">
          <input type="checkbox" name="memberIds" value={member.id} />{member.displayName}
        </label>)}
        <label>Message (optional)<textarea name="message" rows={3} maxLength={seed.limits.shareMessageCharacters} /></label>
        <p className="muted">Plain text, up to {seed.limits.shareMessageCharacters} characters. Your message stays in your activity.</p>
      </fieldset>
      {!review ? <button type="submit" disabled={pending}>Review message</button> : null}
    </form>
    {review ? <section aria-label="Review message">
      <p>{review.items.filter(item => item.readable).map(item => item.displayName).join(', ')}{review.items.some(item => item.readable) ? ' can already read this page.' : ''}</p>
      {missing.length ? <p>{missing.map(item => item.displayName).join(', ')} cannot read this page. Add View access and send, or cancel. Nothing has been sent.</p> : <p>Send one inbox item to each selected member.</p>}
      <p className="share-message-text">{review.message || 'No message'}</p>
      <div className="action-row"><button type="button" className="primary-button" disabled={pending} onClick={async () => {
        setPending(true); setError(undefined);
        try {
          await mutate(`/api/sharing/pages/${pageId}/messages`, { memberIds: review.memberIds, message: review.message, operationKey: review.operationKey, grantMemberIds: missing.map(item => item.id) });
          setReview(undefined); setSent(true); onSent();
        } catch (cause) { setError(cause); }
        finally { setPending(false); }
      }}>{missing.length ? 'Add View access and send' : 'Send page'}</button>
      <button type="button" disabled={pending} onClick={() => { setReview(undefined); setError(undefined); }}>Cancel message</button></div>
    </section> : null}
    {sent ? <p role="status">Page sent to the selected members.</p> : null}
    {error ? <p role="alert">{errorMessage(error)}</p> : null}
  </section>;
}
