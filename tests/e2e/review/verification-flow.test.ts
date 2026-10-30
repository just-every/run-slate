import { env } from 'cloudflare:test';
import { test, expect } from 'vitest';
import { reviewFixture } from './fixture';
import { scheduledDiscovery } from '../../../src/core/features/notifications/jobs';
import type { AppBindings } from '../../../src/core/app/types';

// STAT-003 through the status route: the server sets 7/30/90-day expiries from its own
// clock, accepts a future date or none, refuses a past date and an unopened revision,
// and an edit afterwards shows the verified revision is not the current one.
test('Verifying offers 7, 30 or 90 days, a date or none, only on the opened revision, and an edit makes it not current', async () => {
  const f = await reviewFixture(env.DB), { request, sql, now } = f;
  let key = 0;
  const op = () => `verification-flow-${++key}`;
  const created = await request('owner', 'POST', '/api/pages', { operationKey: op(), containerId: 'c', title: 'Handbook flow page' });
  expect(created.status).toBe(200);
  const id = created.data.value.pageId as string;
  let revision = created.data.receipt.revisionId as string;
  const working = revision;
  const verify = (actor: string, body: Record<string, unknown>) => request(actor, 'POST', `/api/status/page/${id}`, { operationKey: op(), expectedRevisionId: revision, statusKey: 'verified', attestRevisionId: working, ...body });
  const current = async (actor = 'owner') => (await request(actor, 'GET', `/api/status/page/${id}`)).data.verification;

  // Not yet opened: the existing refusal, in plain words.
  const unopened = await verify('owner', { expiresInDays: 90 });
  expect(unopened.status).toBe(409);
  expect(unopened.data.code).toBe('REVISION_NOT_OPENED');
  expect((await request('owner', 'POST', `/api/pages/${id}/open`, { operationKey: op(), revisionId: working })).status).toBe(200);

  for (const days of [7, 30, 90]) {
    const response = await verify('owner', { expiresInDays: days });
    expect(response.status, `${days} days`).toBe(200);
    revision = response.data.receipt.revisionId;
    const v = await current();
    expect(Date.parse(v.expires_at) - Date.parse(v.created_at), `${days} days`).toBe(days * 86_400_000);
    expect(v).toMatchObject({ state: 'current', current: true, revision_id: working, owner_member_id: 'owner', verifier: { id: 'owner', active: true }, openedCurrent: true });
  }
  for (const [body, code] of [[{ expiresInDays: 45 }, 'INVALID_EXPIRY'], [{ expiresAt: '2000-01-01T00:00:00.000Z' }, 'INVALID_EXPIRY'], [{ expiresAt: new Date(Date.parse(now) - 1000).toISOString() }, 'INVALID_EXPIRY'], [{ expiresInDays: 7, expiresAt: '2099-01-01T00:00:00.000Z' }, 'INVALID_EXPIRY'], [{ expiresAt: 'tomorrow' }, 'INVALID_EXPIRY']] as const) {
    const refused = await verify('owner', body);
    expect(refused.status, JSON.stringify(body)).toBe(400);
    expect(refused.data.code, JSON.stringify(body)).toBe(code);
  }
  const dated = await verify('owner', { expiresAt: '2099-03-04T05:06:07+02:00' });
  expect(dated.status).toBe(200);
  revision = dated.data.receipt.revisionId;
  expect((await current()).expires_at).toBe('2099-03-04T03:06:07.000Z');
  const forever = await verify('owner', { expiresAt: null });
  expect(forever.status).toBe(200);
  revision = forever.data.receipt.revisionId;
  expect(await current()).toMatchObject({ expires_at: null, state: 'current' });

  // A second member edits; the page now says the verified revision is not the current one.
  await sql("INSERT INTO page_grants(id,page_id,principal_kind,principal_id,level,created_at,updated_at) VALUES('flow-editor',?,'member','reader','edit',?,?)", id, now, now);
  expect((await request('reader', 'GET', `/api/status/page/${id}`)).data.verification.openedCurrent).toBe(false);
  const edited = await request('reader', 'PATCH', `/api/pages/${id}`, { operationKey: op(), expectedRevisionId: revision, properties: { title: 'Handbook flow page, edited' } });
  expect(edited.status).toBe(200);
  const changed = await current();
  expect(changed).toMatchObject({ state: 'changed', current: false, lapsed: false, changedSince: true, revision_id: working, revisionsSince: 1, editorsSince: ['reader'] });
  expect(changed.workingRevisionId).not.toBe(working);
  const page = (await request('owner', 'GET', `/api/pages/${id}`)).data;
  expect(page.verification).toMatchObject({ state: 'changed', current: false, revisionId: working, ownerDisplayName: 'owner', ownerActive: true });
  // The verified revision still opens as committed and says a newer one exists (REV-005); compare works between them (REV-004).
  expect((await request('owner', 'GET', `/api/revisions/${id}/${working}`)).data).toMatchObject({ id: working, newerRevisionExists: true });
  const compared = await request('owner', 'GET', `/api/revisions/${id}/compare/${working}/${changed.workingRevisionId}`);
  expect(compared.status).toBe(200);
  expect(compared.data.properties.before.title).toBe('Handbook flow page');
  expect(compared.data.properties.after.title).toBe('Handbook flow page, edited');
  // The editor has not opened the new revision as a reader would, so attesting the old one is refused.
  revision = edited.data.receipt.revisionId;
  const stale = await verify('reader', { expiresInDays: 7 });
  expect(stale.status).toBe(409);
  expect(stale.data.code).toBe('EXACT_REVISION_REQUIRED');

  // STAT-006: a named review is actual work with its own generation and receipt.
  const dueDate = new Date(Date.parse(now) - 86400000).toISOString().slice(0, 10);
  const assignment = { assigneeKind: 'member', assigneeId: 'reader', date: dueDate, time: '09:00', timezone: 'UTC', note: 'Please check the handbook changes.' };
  const requestReview = async () => request('owner', 'POST', `/api/status/requests/page/${id}`, { operationKey: op(), expectedRevisionId: revision, ...assignment });
  const review = await requestReview();
  expect(review.status).toBe(200);
  const reviewId = review.data.value.id;
  const reviewCAS = { expectedRevisionId: review.data.value.revisionId, assignmentGeneration: review.data.value.assignmentGeneration };
  const assigned = await request('reader', 'GET', '/api/status/requests/queue?view=assigned');
  expect(assigned.data.items.find((i: any) => i.id === reviewId)).toMatchObject({ pageId: id, note: assignment.note, canVerify: true, openedCurrent: false });
  expect((await request('owner', 'GET', '/api/status/requests/queue?view=requested')).data.items.map((i: any) => i.id)).toContain(reviewId);
  expect((await request('reader', 'GET', '/api/notifications')).data.items.filter((i: any) => i.event === 'review-requested' && i.detail.reviewRequestId === reviewId)).toHaveLength(1);
  const finish = () => request('reader', 'POST', `/api/status/requests/${reviewId}/verify`, { operationKey: op(), ...reviewCAS, pageRevisionId: revision, attestRevisionId: changed.workingRevisionId, statusKey: 'verified', expiresInDays: 30 });
  expect((await finish()).data.code).toBe('REVISION_NOT_OPENED');
  expect((await request('reader', 'POST', `/api/pages/${id}/open`, { operationKey: op(), revisionId: changed.workingRevisionId })).status).toBe(200);
  const reviewed = await finish();
  expect(reviewed.status).toBe(200);
  revision = reviewed.data.receipt.revisionId;
  expect((await request('reader', 'GET', `/api/status/requests/${reviewId}`)).data.request.state).toBe('verified');
  expect((await current()).verifier.id).toBe('reader');
  expect((await request('reader', 'GET', '/api/status/requests/queue?view=assigned')).data.items.map((i: any) => i.id)).not.toContain(reviewId);

  // Requesting changes creates a native, replay-safe page comment in the same write.
  const changesReview = await requestReview(), changesId = changesReview.data.value.id;
  const changesInput = { operationKey: op(), expectedRevisionId: changesReview.data.value.revisionId, assignmentGeneration: 1, note: 'Correct the on-call escalation instructions.' };
  const changesRequested = await request('reader', 'POST', `/api/status/requests/${changesId}/changes`, changesInput);
  expect(changesRequested.status).toBe(200);
  expect((await request('reader', 'POST', `/api/status/requests/${changesId}/changes`, changesInput)).data.value.commentId).toBe(changesRequested.data.value.commentId);
  expect((await request('owner', 'GET', `/api/comments/page/${id}`)).text).toContain(changesInput.note);
  expect((await request('owner', 'GET', `/api/status/requests/${changesId}`)).data.request).toMatchObject({state: 'changes_requested', commentId: changesRequested.data.value.commentId});
  expect((await request('reader', 'POST', `/api/status/requests/${changesId}/changes`, {...changesInput, operationKey: op(), note: 'Stale request must not leave a comment.'})).status).toBe(409);
  expect((await request('owner', 'GET', `/api/comments/page/${id}`)).text).not.toContain('Stale request must not leave a comment.');

  // Public discovery scheduling issues each overdue stage once; owners wait 24 hours.
  const overdue = await requestReview(), overdueId = overdue.data.value.id;
  await scheduledDiscovery(env as AppBindings);
  await scheduledDiscovery(env as AppBindings);
  const reviewerNotices = (await request('reader', 'GET', '/api/notifications')).data.items;
  expect(reviewerNotices.filter((i: any) => i.event === 'review-overdue' && i.detail.reviewRequestId === overdueId)).toHaveLength(1);
  expect((await request('owner', 'GET', '/api/notifications')).data.items.filter((i: any) => i.event === 'review-escalated' && i.detail.reviewRequestId === overdueId)).toHaveLength(0);
  // Advance this durable reminder's timestamp rather than sleeping a day.
  await sql("UPDATE review_request_deliveries SET created_at=? WHERE request_id=? AND stage='reviewer'", new Date(Date.parse(now) - 25 * 3600000).toISOString(), overdueId);
  await scheduledDiscovery(env as AppBindings);
  await scheduledDiscovery(env as AppBindings);
  expect((await request('owner', 'GET', '/api/notifications')).data.items.filter((i: any) => i.event === 'review-escalated' && i.detail.reviewRequestId === overdueId)).toHaveLength(1);
  const cancelled = await requestReview(), cancelledId = cancelled.data.value.id;
  expect((await request('owner', 'POST', `/api/status/requests/${cancelledId}/cancel`, {operationKey: op(), expectedRevisionId: cancelled.data.value.revisionId, assignmentGeneration: 1})).status).toBe(200);
  await scheduledDiscovery(env as AppBindings);
  expect((await request('reader', 'GET', '/api/notifications')).data.items.filter((i: any) => i.detail.reviewRequestId === cancelledId)).toHaveLength(0);

  // Bulk attestation is still the same human/open/edit authority for every page.
  const unopenedBulk = await request('owner', 'POST', '/api/status/review/bulk-verify', {items: [{pageId: id, operationKey: op(), pageRevisionId: revision, attestRevisionId: changed.workingRevisionId, statusKey: 'verified'}]});
  expect(unopenedBulk.data.items[0]).toMatchObject({verified: false, code: 'REVISION_NOT_OPENED'});
  expect((await request('owner', 'POST', `/api/pages/${id}/open`, {operationKey: op(), revisionId: changed.workingRevisionId})).status).toBe(200);
  const bulk = await request('owner', 'POST', '/api/status/review/bulk-verify', {items: [{pageId: id, operationKey: op(), pageRevisionId: revision, attestRevisionId: changed.workingRevisionId, statusKey: 'verified'}]});
  expect(bulk.data.items).toEqual([{pageId: id, verified: true}]);
  await compareBlockHistory(f, op);
}, 60_000);

/** Native commits, nonadjacent history and profile switches leave both snapshots intact. */
async function compareBlockHistory(f: Awaited<ReturnType<typeof reviewFixture>>, op: () => string) {
  const { request } = f;
  const retained: { pageId: string; left: any; right: any; history: any }[] = [];
  const profile = async (value: string) => {
    const workspace = (await request('owner', 'GET', '/api/workspace')).data;
    const { id: _id, revisionId, ...settings } = workspace;
    const response = await request('owner', 'PUT', '/api/workspace', { ...settings, operationKey: op(), expectedRevisionId: revisionId, policies: { ...workspace.policies, 'page.version.v1': value } });
    expect(response.status).toBe(200);
  };
  const compare = async (pageId: string, left: any, right: any, changes: Record<string, string>) => {
    const response = await request('owner', 'GET', `/api/revisions/${pageId}/compare/${left.id}/${right.id}`);
    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({ leftId: left.id, rightId: right.id, properties: { before: left.properties, after: right.properties } });
    expect(Object.fromEntries(response.data.blocks.map((item: any) => [item.id.split('-').at(-1), item.change]))).toEqual(changes);
    for (const item of response.data.blocks) {
      expect(item.before).toEqual(left.blocks.find((block: any) => block.id === item.id) ?? null);
      expect(item.after).toEqual(right.blocks.find((block: any) => block.id === item.id) ?? null);
    }
  };
  const forward = { anchor: 'unchanged', removed: 'removed', changed: 'changed', moved: 'changed', typed: 'changed', nested: 'changed', added: 'added' };
  const backward = { ...forward, removed: 'added', added: 'removed' };
  for (const policy of ['autosnapshot', 'labelled']) {
    await profile(policy);
    const block = (name: string, text: string, position: string, extra = {}) => ({ id: `${policy}-${name}`, blockType: 'paragraph', content: { text: [{ text }] }, treePosition: position, ...extra });
    const blocks = [block('anchor', 'Keep the introduction.', '00'), block('removed', 'Retire the old instruction.', '10'), block('changed', 'Call the old escalation line.', '20'), block('moved', 'Move this instruction earlier.', '30'), block('typed', 'Keep these words as a quotation.', '40'), block('nested', 'Nest this explanation.', '50')];
    const created = await request('owner', 'POST', '/api/pages', { operationKey: op(), containerId: 'c', title: `Revision comparison ${policy}`, blocks });
    expect(created.status).toBe(200);
    const pageId = created.data.value.pageId;
    const snapshot = async (revision: string) => {
      const response = await request('owner', 'GET', `/api/revisions/${pageId}/${revision}`);
      expect(response.status).toBe(200);
      return response.data;
    };
    const middle = await request('owner', 'PATCH', `/api/pages/${pageId}`, { operationKey: op(), expectedRevisionId: created.data.receipt.revisionId, properties: { title: `Revision comparison ${policy}, edited` } });
    expect(middle.status).toBe(200);
    const after = [blocks[0], block('added', 'Add the new instruction here.', '05'), { ...blocks[3], treePosition: '15' }, block('changed', 'Call the new escalation line.', '20'), { ...blocks[4], blockType: 'quote' }, { ...blocks[5], parentBlockId: blocks[0].id }];
    const edited = await request('owner', 'PUT', `/api/pages/${pageId}/blocks`, { operationKey: op(), expectedRevisionId: middle.data.receipt.revisionId, blocks: after });
    expect(edited.status).toBe(200);
    const left = await snapshot(created.data.receipt.revisionId);
    const right = await snapshot(edited.data.receipt.revisionId);
    const history = (await request('owner', 'GET', `/api/revisions/${pageId}`)).data;
    expect(history.items.slice(0, 3).map((item: any) => item.id)).toEqual([right.id, middle.data.receipt.revisionId, left.id]);
    await compare(pageId, left, right, forward);
    await compare(pageId, right, left, backward);
    await compare(pageId, right, right, Object.fromEntries(right.blocks.map((item: any) => [item.id.split('-').at(-1), 'unchanged'])));
    retained.push({ pageId, left, right, history });
  }
  for (const policy of ['autosnapshot', 'labelled', 'autosnapshot']) {
    await profile(policy);
    for (const { pageId, left, right, history } of retained) {
      await compare(pageId, left, right, forward);
      expect((await request('owner', 'GET', `/api/revisions/${pageId}`)).data).toEqual(history);
      expect((await request('owner', 'GET', `/api/revisions/${pageId}/${left.id}`)).data).toEqual(left);
      expect((await request('owner', 'GET', `/api/revisions/${pageId}/${right.id}`)).data).toEqual(right);
    }
  }
}
