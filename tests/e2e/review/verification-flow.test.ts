import { env } from 'cloudflare:test';
import { test, expect } from 'vitest';
import { reviewFixture } from './fixture';

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
}, 60_000);
