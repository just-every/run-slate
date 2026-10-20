import { applyD1Migrations, env } from 'cloudflare:test';
import { expect } from 'vitest';
import { contract } from '../contract';
import { reviewFixture } from './fixture';
import { createApi } from '../../../src/core/app/hono';
import { runVerificationRules } from '../../../src/core/features/page-status/rules/run';
import { runContentJobs } from '../../../src/core/features/lifecycle/jobs';
import type { AppBindings } from '../../../src/core/app/types';

// STAT-007 in the default core-wiki profile, on a store written before migration 0044
// (released v0.3.0 data) that then upgrades in place.
contract('STAT-007', 'Verification rules unverify and flag exactly the expected pages, record activity, send one coalesced notice per owner and refuse a verify action', async () => {
  const db = (env as unknown as { PRIOR_DB: D1Database }).PRIOR_DB;
  await applyD1Migrations(db, env.TEST_MIGRATIONS.filter(m => m.name < '0044_verification_rules.sql'));
  const f = await reviewFixture(db), { page, verify, sql, at, now, cookies } = f;
  const core = { ...env, DB: db, SLATE_PROFILE: undefined } as AppBindings, app = createApi();
  const api = async (actor: string, method: string, path: string, body?: unknown) => {
    const response = await app.request('http://localhost:8787/api' + path, { method, headers: { cookie: cookies[actor]!, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) }, core);
    return { status: response.status, data: await response.json() as any };
  };
  const rows = async (query: string, ...values: unknown[]) => (await db.prepare(query).bind(...values).all<any>()).results;
  const view = (id: string, daysAgo: number) => sql("INSERT INTO page_views(id,workspace_id,page_id,container_id,viewer_member_id,viewer_kind,viewed_at) VALUES(?,'w',?,(SELECT container_id FROM pages WHERE id=?),'owner','member',?)", `view-${id}-${daysAgo}`, id, id, at(-daysAgo));
  const body = (id: string, value: unknown) => sql('UPDATE page_revisions SET body_json=? WHERE id=?', JSON.stringify(value), 'rev-' + id);
  const owned = (id: string, owner: string | null) => sql('UPDATE pages SET owner_member_id=? WHERE id=?', owner, id);

  // Container c: Alex Owner ("owner") and "denied" own it; "reader" can read it and owns two pages.
  await sql("INSERT INTO container_owners VALUES('c','denied',?)", now);
  await sql("INSERT INTO container_grants(id,container_id,principal_kind,principal_id,level,created_at,updated_at) VALUES('denied-c','c','member','denied','view',?,?)", now, now);
  for (const id of ['target-edited', 'target-unchanged']) { await page(id, { title: `Rules ${id}` }); await owned(id, 'owner'); await view(id, 1); }
  await sql("INSERT INTO page_revisions(id,page_id,author_member_id,origin,content_hash,body_json,properties_json,created_at) VALUES('edit-target','target-edited','owner','autosave','h2','[]','{\"title\":\"Rules target-edited\"}',?)", at(-1));
  await sql("UPDATE pages SET working_revision_id='edit-target' WHERE id='target-edited'");
  await page('cites-edited', { title: 'Rulesneedle citing runbook' });
  await body('cites-edited', [{ id: 'b1', type: 'paragraph', content: [{ text: 'See ' }, { text: 'the target', mention: { kind: 'page', id: 'target-edited' } }] }]);
  await page('cites-unchanged', { title: 'Rules cites unchanged' });
  await body('cites-unchanged', [{ id: 'b1', type: 'paragraph', content: [{ text: 'Linked', link: { href: '/app/pages/target-unchanged' } }] }]);
  for (const id of ['cites-edited', 'cites-unchanged']) { await owned(id, 'reader'); await verify(id); await view(id, 2); }
  await page('no-owner', { title: 'Rules no owner' }); await verify('no-owner'); await view('no-owner', 3);
  await page('inactive-owner', { title: 'Rules inactive owner' }); await owned('inactive-owner', 'removed'); await view('inactive-owner', 3);
  await page('restricted', { title: 'Rules restricted', restricted: true });
  await sql("INSERT INTO page_grants(id,page_id,principal_kind,principal_id,level,created_at,updated_at) VALUES('restricted-denied','restricted','member','denied','view',?,?)", now, now);
  for (const [id, days] of [['unviewed-181', 181], ['viewed-179', 179]] as const) { await page(id, { title: `Rules ${id}` }); await owned(id, 'owner'); await verify(id); await view(id, days); }
  // Container c2: its rules stay off; its ownerless, unviewed, verified page is never touched.
  await sql("INSERT INTO containers(id,workspace_id,name,created_at,updated_at,revision_id) VALUES('c2','w','Second collection',?,?,'r')", now, now);
  await sql("INSERT INTO container_owners VALUES('c2','owner',?)", now);
  await sql("INSERT INTO container_grants(id,container_id,principal_kind,principal_id,level,created_at,updated_at) VALUES('owner-c2','c2','member','owner','full',?,?)", now, now);
  await page('c2-page', { title: 'Rules other space', container: 'c2' }); await verify('c2-page');
  const verificationRows = (await rows('SELECT COUNT(*) AS n FROM page_verifications'))[0].n;

  // Released data upgrades in place: 0044 adds empty tables and changes no prior row.
  const before = await rows('SELECT * FROM page_verifications ORDER BY id');
  await applyD1Migrations(db, env.TEST_MIGRATIONS);
  expect(await rows('SELECT * FROM page_verifications ORDER BY id')).toEqual(before);

  // A verify action, or any action other than the kind's own, is refused before anything is stored.
  for (const action of ['verify', 'renew', 'flag']) {
    const refused = await api('owner', 'PUT', '/status/rules/container/c', { operationKey: `refuse-${action}`, kind: 'cited-changed', action, enabled: true });
    expect(refused.status, action).toBe(400);
    expect(refused.data.code, action).toBe('RULE_ACTION_REFUSED');
  }
  expect((await api('owner', 'POST', '/status/rules/container/c/preview', { kind: 'unviewed', action: 'verify', days: 180 })).data.code).toBe('RULE_ACTION_REFUSED');
  // Anyone who is not a container owner is refused by the container settings authorization.
  expect((await api('reader', 'PUT', '/status/rules/container/c', { operationKey: 'reader-rule', kind: 'no-owner', action: 'flag', enabled: true })).status).toBe(403);
  expect((await api('reader', 'GET', '/status/rules/container/c')).status).toBe(403);
  expect((await api('reader', 'POST', '/status/rules/container/c/preview', { kind: 'no-owner', action: 'flag' })).status).toBe(403);
  expect(await rows('SELECT * FROM verification_rules')).toEqual([]);

  // A preview shows exactly what tonight's run would change, and writes nothing.
  const tables = ['page_verifications', 'verification_rules', 'verification_rule_runs', 'verification_rule_flags', 'activity_entries', 'notification_outbox', 'notifications'];
  const snapshot = async () => Object.fromEntries(await Promise.all(tables.map(async t => [t, await rows(`SELECT * FROM ${t} ORDER BY 1`)])));
  const quiet = await snapshot();
  const preview = async (kind: string, action: string, actor = 'owner') => (await api(actor, 'POST', '/status/rules/container/c/preview', { kind, action, ...(kind === 'unviewed' ? { days: 180 } : {}) })).data;
  expect(await preview('cited-changed', 'unverify')).toEqual({ kind: 'cited-changed', action: 'unverify', hidden: 0, pages: [{ pageId: 'cites-edited', title: 'Rulesneedle citing runbook', reason: { rule: 'cited-changed', citedPageIds: ['target-edited'] }, alreadyFlagged: false }] });
  const ownerless = await preview('no-owner', 'flag');
  expect(ownerless.pages.map((p: any) => [p.pageId, p.reason.owner])).toEqual([['inactive-owner', 'inactive'], ['no-owner', 'unset']]);
  expect(ownerless.hidden).toBe(1);
  expect((await preview('no-owner', 'flag', 'denied')).pages.map((p: any) => p.pageId)).toEqual(['inactive-owner', 'no-owner', 'restricted']);
  expect((await preview('unviewed', 'flag')).pages.map((p: any) => [p.pageId, p.reason.days])).toEqual([['unviewed-181', 180]]);
  expect(await snapshot()).toEqual(quiet);

  // Turn the three rules on in c. Tonight's run does nothing: a rule first runs the next night.
  for (const [kind, action] of [['cited-changed', 'unverify'], ['no-owner', 'flag'], ['unviewed', 'flag']]) {
    const saved = await api('owner', 'PUT', '/status/rules/container/c', { operationKey: `enable-${kind}`, kind, action, enabled: true, ...(kind === 'unviewed' ? { days: 180 } : {}) });
    expect(saved.status, JSON.stringify(saved.data)).toBe(200);
  }
  expect((await runVerificationRules(core)).runs).toBe(0);
  expect(await rows('SELECT * FROM verification_rule_flags')).toEqual([]);
  // The next night: the stored switch-on time moves back rather than the test sleeping.
  await sql('UPDATE verification_rules SET enabled_at=?', at(-1));

  // Concurrent invocations commit one run.
  await Promise.all([runVerificationRules(core), runVerificationRules(core)]);
  const verification = async (id: string, actor = 'owner') => (await api(actor, 'GET', `/status/page/${id}`)).data.verification;
  expect((await verification('cites-edited', 'reader')).state).toBe('lapsed');
  for (const id of ['cites-unchanged', 'no-owner', 'unviewed-181', 'viewed-179', 'c2-page']) expect((await verification(id)).state, id).toBe('current');
  const ended = (await rows("SELECT * FROM page_verifications WHERE id='v-cites-edited'"))[0];
  expect(ended).toMatchObject({ status_key: 'verified', revision_id: 'rev-cites-edited', owner_member_id: 'owner' });
  expect(ended.expires_at <= new Date().toISOString() && ended.lapsed_notified_at === ended.expires_at).toBe(true);
  expect((await rows('SELECT COUNT(*) AS n FROM page_verifications'))[0].n).toBe(verificationRows);
  expect(await rows("SELECT r.kind,f.page_id FROM verification_rule_flags f JOIN verification_rules r ON r.id=f.rule_id ORDER BY 1,2")).toEqual([
    { kind: 'no-owner', page_id: 'inactive-owner' }, { kind: 'no-owner', page_id: 'no-owner' }, { kind: 'no-owner', page_id: 'restricted' }, { kind: 'unviewed', page_id: 'unviewed-181' }]);
  // The unverified page reads lapsed in search too; a flag does not change a page's trust.
  const found = await api('reader', 'GET', '/search?' + new URLSearchParams({ q: 'Rulesneedle' }));
  expect(found.data.items.map((x: any) => [x.id, x.trust.state])).toEqual([['cites-edited', 'lapsed']]);

  // One activity entry per changed page, the system as actor, naming the rule and why.
  const entries = await rows("SELECT actor_member_id,action,target_kind,target_id,detail_json FROM activity_entries WHERE feature='verification-rules' AND action<>'verification-rules.save' ORDER BY target_id");
  expect(entries.map(e => [e.actor_member_id, e.action, e.target_kind, e.target_id, JSON.parse(e.detail_json).reason])).toEqual([
    [null, 'verification-rules.unverified', 'page', 'cites-edited', { rule: 'cited-changed', citedPageIds: ['target-edited'] }],
    [null, 'verification-rules.flagged', 'page', 'inactive-owner', { rule: 'no-owner', owner: 'inactive' }],
    [null, 'verification-rules.flagged', 'page', 'no-owner', { rule: 'no-owner', owner: 'unset' }],
    [null, 'verification-rules.flagged', 'page', 'restricted', { rule: 'no-owner', owner: 'unset' }],
    [null, 'verification-rules.flagged', 'page', 'unviewed-181', { rule: 'unviewed', days: 180, lastViewedAt: at(-181) }],
  ]);
  const activityFor = async (actor: string) => (await api(actor, 'GET', '/activity?limit=100')).data.items.filter((i: any) => i.action.startsWith('verification-rules.') && i.action !== 'verification-rules.save').map((i: any) => i.target.id).sort();
  expect(await activityFor('owner')).toEqual(['cites-edited', 'inactive-owner', 'no-owner', 'unviewed-181']);
  expect(await activityFor('denied')).toContain('restricted');

  // One coalesced notice per affected owner, titles and counts only for pages that owner can read.
  const notices = async (actor: string) => (await api(actor, 'GET', '/notifications')).data.items.filter((i: any) => i.event === 'verification-rules');
  const listed = async (actor: string) => { const items = await notices(actor); expect(items, actor).toHaveLength(1); return items[0].detail.verificationRules; };
  expect(await listed('owner')).toMatchObject({ containerId: 'c', unverified: 0, flagged: 3, pages: [{ id: 'inactive-owner', change: 'flagged' }, { id: 'no-owner', change: 'flagged' }, { id: 'unviewed-181', title: 'Rules unviewed-181', change: 'flagged', rule: 'unviewed' }] });
  expect((await listed('denied')).pages.map((p: any) => p.id)).toEqual(['inactive-owner', 'no-owner', 'restricted']);
  expect(await listed('reader')).toMatchObject({ unverified: 1, flagged: 0, pages: [{ id: 'cites-edited', title: 'Rulesneedle citing runbook', change: 'unverified', rule: 'cited-changed' }] });
  expect(JSON.stringify(await rows("SELECT detail_json FROM notifications WHERE event='verification-rules'"))).not.toContain('the target');
  expect(await rows("SELECT recipient_member_id FROM notifications WHERE event='verification-rules' ORDER BY 1")).toEqual([{ recipient_member_id: 'denied' }, { recipient_member_id: 'owner' }, { recipient_member_id: 'reader' }]);

  // A second run the same night, and the STAT-004 lapse job, change nothing more.
  const ran = await snapshot();
  expect((await runVerificationRules(core)).runs).toBe(0);
  await runContentJobs(core);
  expect(await snapshot()).toEqual(ran);
  expect(await rows("SELECT id FROM notification_outbox WHERE event='verification-lapsed'")).toEqual([]);

  // The flag shows on the page's status panel and the container's rules panel; the owner dismisses it.
  expect((await api('owner', 'GET', '/status/rules/page/no-owner')).data.flags).toMatchObject([{ kind: 'no-owner', canDismiss: true }]);
  expect((await api('reader', 'GET', '/status/rules/page/cites-edited')).data.ended).toMatchObject({ reason: { rule: 'cited-changed' } });
  const panel = (await api('owner', 'GET', '/status/rules/container/c')).data;
  expect([panel.flags.map((x: any) => x.pageId), panel.hiddenFlags]).toEqual([['inactive-owner', 'no-owner', 'unviewed-181'], 1]);
  expect((await api('reader', 'POST', '/status/rules/page/no-owner/dismiss', { operationKey: 'reader-dismiss', kind: 'no-owner' })).status).toBe(403);
  expect((await api('owner', 'POST', '/status/rules/page/no-owner/dismiss', { operationKey: 'owner-dismiss', kind: 'no-owner' })).status).toBe(200);
  expect((await api('owner', 'GET', '/status/rules/page/no-owner')).data.flags).toEqual([]);
  expect(await rows("SELECT * FROM verification_rule_flags WHERE page_id LIKE 'c2%'")).toEqual([]);
});
