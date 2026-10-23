import {peopleCase} from './people-case';
import { env } from 'cloudflare:test';
import { test, expect } from 'vitest';
import { reviewFixture } from './fixture';

// The "Needs review" list is access control: every subject sees exactly the rows of the
// pages it may read today, and nothing of the others — no row, title, state or count.
test('Needs review and the people directory expose only readable work, with live access, expertise choices and explicit review routing', async () => {
  const f = await reviewFixture(env.DB), { sql, now, page, verify, request, at } = f;
  type Case = { id: string; marker: string; allowed: string[]; verifier: string; state: 'lapsed' | 'changed' | 'expiring' | 'current' };
  const cases: Case[] = [];
  const add = async (id: string, allowed: string[], options: Parameters<typeof page>[1] & { verifier?: string; state?: Case['state'] } = {}) => {
    const marker = `Marker${id.replace(/[^a-z]/gi, '')}Unique`;
    await page(id, { ...options, title: marker });
    const state = options.state ?? 'lapsed';
    await verify(id, { verifier: options.verifier, expiresAt: state === 'lapsed' ? at(-1) : state === 'expiring' ? at(5) : state === 'current' ? at(100) : null, changed: state === 'changed' });
    cases.push({ id, marker, allowed, verifier: options.verifier ?? 'owner', state });
  };
  const shared = ['owner', 'reader', 'guest'];
  await add('shared-lapsed', shared);
  await add('shared-changed', shared, { state: 'changed' });
  await add('shared-expiring', shared, { state: 'expiring' });
  await add('shared-current', shared, { state: 'current' });
  await add('reader-verified', shared, { verifier: 'reader' });
  await add('verifier-left-current', shared, { verifier: 'removed', state: 'current' });
  await add('verifier-left-lapsed', shared, { verifier: 'inactive' });
  await page('parent', { title: 'ReadableParentTitle' });
  await add('restricted-child', [], { parent: 'parent', restricted: true });
  await add('owner-draft', ['owner'], { lifecycle: 'draft' });
  await add('member-draft', ['reader'], { lifecycle: 'draft', author: 'reader', verifier: 'reader' });
  for (const [id, owner] of [['personal', 'owner'], ['member-personal', 'reader']]) {
    await sql("INSERT INTO containers(id,workspace_id,name,visibility,created_at,updated_at,revision_id) VALUES(?,'w',?,'personal',?,?,'r')", id, id, now, now);
    await sql('INSERT INTO container_owners VALUES(?,?,?)', id, owner, now);
    await sql("INSERT INTO container_grants(id,container_id,principal_kind,principal_id,level,created_at,updated_at) VALUES(?,?,'member',?,'full',?,?)", id + '-grant', id, owner, now, now);
  }
  await add('owner-personal', ['owner'], { container: 'personal' });
  await add('member-personal', ['reader'], { container: 'member-personal', author: 'reader', verifier: 'reader' });
  await add('page-only', ['page-guest'], { restricted: true });
  await sql("INSERT INTO page_grants(id,page_id,principal_kind,principal_id,level,created_at,updated_at) VALUES('guest-page','page-only','member','page-guest','view',?,?)", now, now);
  await add('archived', []);
  await sql("UPDATE pages SET archived_at=?,lifecycle='archived' WHERE id='archived'", now);
  await add('trashed', []);
  await sql("UPDATE pages SET trashed_at=? WHERE id='trashed'", now);
  // A status cleared after verification no longer claims to be verified, so it needs no review.
  await add('status-cleared', []);
  await sql("UPDATE pages SET status_key=NULL WHERE id='status-cleared'");

  const owners = ['owner'];
  const needs = (c: Case) => c.state !== 'current';
  const left = (c: Case) => ['removed', 'inactive'].includes(c.verifier);
  const expected = (actor: string, filter: string) => cases.filter(c => c.allowed.includes(actor) && (filter === 'mine' ? c.verifier === actor && needs(c) : filter === 'everyone' ? needs(c) : left(c)));
  const actors = ['owner', 'reader', 'denied', 'guest', 'page-guest', 'expired', 'revoked', 'inactive', 'removed', 'anonymous'];
  const table: { actor: string; filter: string; expected: number; observed: number; titles: string }[] = [];
  for (const actor of actors) for (const filter of ['mine', 'everyone', 'no-verifier']) {
    const response = await request(actor, 'GET', `/api/status/review?filter=${filter}`);
    const label = `${actor}: ${filter}`;
    if (['anonymous', 'inactive', 'removed'].includes(actor)) {
      expect(response.status, label).toBe(401);
      for (const c of cases) expect(response.text, label).not.toContain(c.marker);
      table.push({ actor, filter, expected: 0, observed: 0, titles: '401' });
      continue;
    }
    if (filter === 'no-verifier' && !owners.includes(actor)) {
      expect(response.status, label).toBe(403);
      for (const c of cases) expect(response.text, label).not.toContain(c.marker);
      table.push({ actor, filter, expected: 0, observed: 0, titles: '403' });
      continue;
    }
    expect(response.status, label).toBe(200);
    const want = expected(actor, filter);
    expect(response.data.total, label).toBe(want.length);
    expect(response.data.items.map((i: any) => i.title).sort(), label).toEqual(want.map(c => c.marker).sort());
    for (const item of response.data.items) {
      const c = cases.find(x => x.marker === item.title)!;
      expect(item.state, label).toBe(c.state);
      expect(item.verifier.active, label).toBe(!left(c));
      // A page-only guest learns the page, not the name of the space around it.
      expect(item.containerName, label).toBe(actor === 'page-guest' ? null : c.id.includes('personal') ? (c.id === 'owner-personal' ? 'personal' : 'member-personal') : 'Collection');
    }
    for (const c of cases.filter(c => !want.includes(c))) expect(response.text, `${label}: ${c.id}`).not.toContain(c.marker);
    expect(response.data.counts, label).toEqual({ mine: expected(actor, 'mine').length, everyone: expected(actor, 'everyone').length, noVerifier: owners.includes(actor) ? expected(actor, 'no-verifier').length : null });
    table.push({ actor, filter, expected: want.length, observed: response.data.total, titles: response.data.items.map((i: any) => i.title).sort().join(' ') });
  }
  for (const actor of actors) {
    const response = await request(actor, 'GET', '/api/status/review/count');
    if (['anonymous', 'inactive', 'removed'].includes(actor)) { expect(response.status).toBe(401); continue; }
    expect(response.data, actor).toEqual({ count: expected(actor, 'mine').length + (owners.includes(actor) ? expected(actor, 'no-verifier').length : 0) });
  }
  // A changed-since row names how much changed and who changed it, and its Review action opens the compare view.
  const changed = (await request('owner', 'GET', '/api/status/review?filter=everyone')).data.items.find((i: any) => i.pageId === 'shared-changed');
  expect(changed).toMatchObject({ revisionsSince: 1, editorsSince: ['reader'], verifiedRevisionId: 'rev-shared-changed', workingRevisionId: 'edit-shared-changed', reviewHref: '/app/pages/shared-changed?detail=history&revision=rev-shared-changed&compare=edit-shared-changed' });
  // A reader below edit sees only published history: the unpublished edit counts for no one it cannot read.
  expect((await request('reader', 'GET', '/api/status/review?filter=everyone')).data.items.find((i: any) => i.pageId === 'shared-changed')).toMatchObject({ revisionsSince: 0, editorsSince: [], canVerify: false });

  // Live access: a cursor taken before a revocation pages through nothing of the revoked pages.
  const first = await request('reader', 'GET', '/api/status/review?filter=everyone&limit=1');
  expect(first.data.items).toHaveLength(1);
  expect(first.data.nextCursor).toBeTruthy();
  await sql("UPDATE container_grants SET revoked_at=? WHERE id='reader'", now);
  const second = await request('reader', 'GET', `/api/status/review?filter=everyone&limit=100&cursor=${encodeURIComponent(first.data.nextCursor)}`);
  const sharedMarkers = cases.filter(c => c.allowed === shared).map(c => c.marker);
  for (const marker of sharedMarkers) expect(second.text).not.toContain(marker);
  const after = await request('reader', 'GET', '/api/status/review?filter=everyone');
  expect(after.data.items.map((i: any) => i.title).sort()).toEqual(cases.filter(c => c.allowed.includes('reader') && c.allowed !== shared && needs(c)).map(c => c.marker).sort());
  expect((await request('reader', 'GET', '/api/status/review/count')).data).toEqual({ count: cases.filter(c => c.allowed.includes('reader') && c.allowed !== shared && c.verifier === 'reader' && needs(c)).length });
  expect((await request('reader', 'GET', '/api/status/review?cursor=not-a-cursor')).status).toBe(400);
  // STAT-006: group assignment tracks current membership and never grants authority.
  await page('request-access', {title: 'ReviewAssignmentAccessMarker', restricted: true});
  await sql("UPDATE pages SET owner_member_id='reader' WHERE id='request-access'");
  for (const [member, level] of [['owner', 'full'], ['reader', 'view'], ['guest', 'comment']]) await sql("INSERT INTO page_grants(id,page_id,principal_kind,principal_id,level,created_at,updated_at) VALUES(?,'request-access','member',?,?,?,?)", 'review-access-' + member, member, level, now, now);
  await sql("INSERT INTO groups VALUES('review-team','w','Review team',?,?,'r')", now, now);
  for (const member of ['reader', 'guest']) await sql("INSERT INTO group_members VALUES('review-team',?,?)", member, now);
  let sequence = 0;
  const requestOp = () => `request-access-${++sequence}`;
  const groupInput = {operationKey: requestOp(), expectedRevisionId: 'op-request-access', assigneeKind: 'group', assigneeId: 'review-team', date: at(2).slice(0,10), time: '17:00', timezone: 'Australia/Brisbane', note: 'Review this page as a team.'};
  // Its named owner may request with current view access, even without edit.
  const groupReview = await request('reader', 'POST', '/api/status/requests/page/request-access', groupInput);
  expect(groupReview.status).toBe(200);
  const requestId = groupReview.data.value.id;
  const assignedGuest = (await request('guest', 'GET', '/api/status/requests/queue?view=assigned')).data;
  expect(assignedGuest.items.find((i: any) => i.id === requestId)).toMatchObject({assigneeKind: 'group', canVerify: false, canRequestChanges: true});
  expect((await request('denied', 'GET', '/api/status/requests/queue?view=assigned')).text).not.toContain('ReviewAssignmentAccessMarker');
  expect((await request('denied', 'GET', `/api/status/requests/${requestId}`)).status).toBe(404);
  expect((await request('owner', 'POST', `/api/status/requests/${requestId}/changes`, {operationKey: requestOp(), expectedRevisionId: groupReview.data.value.revisionId, assignmentGeneration: 1, note: 'An unassigned editor cannot resolve this.'})).status).toBe(403);
  const inaccessible = await request('reader', 'POST', '/api/status/requests/page/request-access', {...groupInput, operationKey: requestOp(), assigneeKind: 'member', assigneeId: 'denied'});
  expect(inaccessible.status).toBe(400);
  expect((await request('denied', 'GET', '/api/status/requests/queue?view=assigned')).data.items).toHaveLength(0);

  await sql("DELETE FROM group_members WHERE group_id='review-team' AND member_id='guest'");
  expect((await request('guest', 'GET', '/api/status/requests/queue?view=assigned')).data.items.map((i: any) => i.id)).not.toContain(requestId);
  expect((await request('guest', 'GET', '/api/notifications')).data.items.filter((i: any) => i.detail.reviewRequestId === requestId)).toHaveLength(0);
  expect((await request('guest', 'POST', `/api/status/requests/${requestId}/changes`, {operationKey: requestOp(), expectedRevisionId: groupReview.data.value.revisionId, assignmentGeneration: 1, note: 'A former group member cannot resolve this.'})).status).toBe(403);
  const reassignInput = {...groupInput, operationKey: requestOp(), expectedRevisionId: groupReview.data.value.revisionId, assignmentGeneration: 1, assigneeKind: 'member', assigneeId: 'owner'};
  const reassigned = await request('reader', 'POST', `/api/status/requests/${requestId}/reassign`, reassignInput);
  expect(reassigned.status).toBe(200);
  expect(reassigned.data.value.assignmentGeneration).toBe(2);
  expect((await request('reader', 'GET', '/api/status/requests/queue?view=assigned')).data.items.map((i: any) => i.id)).not.toContain(requestId);
  expect((await request('owner', 'GET', '/api/status/requests/queue?view=assigned')).data.items.map((i: any) => i.id)).toContain(requestId);
  // Even an authorized reviewer cannot consume a previous assignment generation.
  const renewed = await request('owner', 'POST', `/api/status/requests/${requestId}/reassign`, {...reassignInput, operationKey: requestOp(), expectedRevisionId: reassigned.data.value.revisionId, assignmentGeneration: 2});
  expect(renewed.status).toBe(200);
  const staleResolution = await request('owner', 'POST', `/api/status/requests/${requestId}/changes`, {operationKey: requestOp(), expectedRevisionId: reassigned.data.value.revisionId, assignmentGeneration: 2, note: 'Stale assignment must not create a comment.'});
  expect(staleResolution.status).toBe(409);
  expect((await request('owner', 'GET', '/api/comments/page/request-access')).text).not.toContain('Stale assignment must not create a comment.');
  // A restore retains pending work and requires explicit reassignment to resume notices.
  await sql('UPDATE review_requests SET dispatch_paused_at=? WHERE id=?', now, requestId);
  expect((await request('owner', 'GET', `/api/status/requests/${requestId}`)).data.request.dispatchPausedAt).toBe(now);
  const resumed = await request('owner', 'POST', `/api/status/requests/${requestId}/reassign`, {...reassignInput, operationKey: requestOp(), expectedRevisionId: renewed.data.value.revisionId, assignmentGeneration: 3});
  expect(resumed.status).toBe(200);
  expect((await request('owner', 'GET', `/api/status/requests/${requestId}`)).data.request).toMatchObject({state: 'pending', assignmentGeneration: 4, dispatchPausedAt: null});
  // A page owner's title does not override a later loss of current read access.
  await sql("UPDATE page_grants SET revoked_at=? WHERE id='review-access-reader'", now);
  expect((await request('reader', 'POST', '/api/status/requests/page/request-access', {...groupInput, operationKey: requestOp()})).status).toBe(404);
  await peopleCase();
  console.error('REVIEW_ACCESS_TABLE ' + JSON.stringify(table));
}, 90_000);
