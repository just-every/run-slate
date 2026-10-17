import { applyD1Migrations, env } from 'cloudflare:test';
import { test, expect } from 'vitest';
import { reviewFixture } from './fixture';
import { runContentJobs } from '../../../src/core/features/lifecycle/jobs';
import type { AppBindings } from '../../../src/core/app/types';

// A store written by the pre-change main (current, lapsed and notified, lapsed and not yet
// notified, changed since, a verifier who left) upgrades in place: its rows are untouched,
// the review list shows each correctly, and the lapse job notifies exactly the one that
// was still due without being held up by the verifier who left.
test('Existing verifications upgrade in place and the list and lapse notice treat each correctly', async () => {
  const db = (env as unknown as { PRIOR_DB: D1Database }).PRIOR_DB;
  await applyD1Migrations(db, env.TEST_MIGRATIONS.filter(m => m.name < '0026_verification_review.sql'));
  const f = await reviewFixture(db), { page, verify, request, sql, at, now } = f;
  const cases = [
    ['prior-current', { expiresAt: at(60) }, 'current'],
    ['prior-lapsed-notified', { expiresAt: at(-2) }, 'lapsed'],
    ['prior-lapsed-due', { expiresAt: at(-1) }, 'lapsed'],
    ['prior-changed', { expiresAt: null, changed: true }, 'changed'],
    ['prior-verifier-left', { expiresAt: at(-1), verifier: 'removed' }, 'lapsed'],
  ] as const;
  for (const [id, options] of cases) { await page(id, { title: `Upgrade ${id}` }); await verify(id, options); }
  // The prior lapse job had already notified this one: its stamp and its notice exist.
  await sql("UPDATE page_verifications SET lapsed_notified_at=? WHERE id='v-prior-lapsed-notified'", at(-1));
  await sql("INSERT INTO notification_outbox(id,workspace_id,actor_member_id,event,page_id,recipients_json,watched_recipients_json,detail_json,created_at) VALUES('verification:v-prior-lapsed-notified:lapsed','w',NULL,'verification-lapsed','prior-lapsed-notified','[\"owner\"]','[]','{}',?)", at(-1));
  const retained = async () => Object.fromEntries(await Promise.all(['page_verifications', 'pages', 'page_revisions', 'notification_outbox'].map(async table => [table, (await db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()).results])));
  const before = await retained();

  await applyD1Migrations(db, env.TEST_MIGRATIONS);
  // Every prior value is kept; the only change is that 0032 gives each page its lock columns, unlocked.
  expect(await retained()).toEqual({ ...before, pages: (before.pages as Record<string, unknown>[]).map(row => ({ ...row, locked_at: null, locked_by_member_id: null })) });
  const indexes = (await db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='page_verifications'").all<{ name: string }>()).results.map(r => r.name);
  expect(indexes).toEqual(expect.arrayContaining(['page_verifications_page_latest', 'page_verifications_due']));

  const listed = async (filter: string) => Object.fromEntries((await request('owner', 'GET', `/api/status/review?filter=${filter}`)).data.items.map((i: { pageId: string; state: string }) => [i.pageId, i.state]));
  expect(await listed('everyone')).toEqual({ 'prior-lapsed-notified': 'lapsed', 'prior-lapsed-due': 'lapsed', 'prior-changed': 'changed', 'prior-verifier-left': 'lapsed' });
  expect(await listed('mine')).toEqual({ 'prior-lapsed-notified': 'lapsed', 'prior-lapsed-due': 'lapsed', 'prior-changed': 'changed' });
  expect(await listed('no-verifier')).toEqual({ 'prior-verifier-left': 'lapsed' });
  for (const [id, , state] of cases) expect((await request('owner', 'GET', `/api/pages/${id}`)).data.verification.state, id).toBe(state);

  // Twice: only the due row is notified, once; the verifier who left gets nothing and blocks nothing.
  const bindings = { ...env, DB: db } as AppBindings;
  expect((await runContentJobs(bindings, now)).expiredVerifications).toBe(1);
  expect((await runContentJobs(bindings, now)).expiredVerifications).toBe(0);
  const notices = (await db.prepare("SELECT id,page_id,recipients_json FROM notification_outbox WHERE event='verification-lapsed' ORDER BY id").all()).results;
  expect(notices).toEqual([
    { id: 'verification:v-prior-lapsed-due:lapsed', page_id: 'prior-lapsed-due', recipients_json: '["owner"]' },
    { id: 'verification:v-prior-lapsed-notified:lapsed', page_id: 'prior-lapsed-notified', recipients_json: '["owner"]' },
  ]);
  expect((await db.prepare("SELECT lapsed_notified_at FROM page_verifications WHERE id='v-prior-verifier-left'").first())!.lapsed_notified_at).toBeNull();
  // History is kept: the upgraded rows are the original attestations, unchanged except the one stamp.
  const after = (await db.prepare('SELECT * FROM page_verifications ORDER BY 1').all()).results;
  expect(after.map(({ lapsed_notified_at: _, ...row }) => row)).toEqual((before.page_verifications as Record<string, unknown>[]).map(({ lapsed_notified_at: _, ...row }) => row));
}, 60_000);
