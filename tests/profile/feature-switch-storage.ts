import {applyD1Migrations, env} from 'cloudflare:test';
import {expect} from 'vitest';
import {createApi} from '../../src/core/app/hono';
import {createOpaqueToken, sessionDigest} from '../../src/core/platform/auth/token';
import {seedWorkspace, seedMember, sessionFor} from '../e2e/setup/fixtures';
import {resetDeployment} from '../e2e/setup/reset-deployment';
import type {SwitchState} from '../../src/core/features/feature-switches/catalog';

export async function featureSwitchUpgrade() {
  const db = (env as unknown as {FEATURE_PRIOR_DB: D1Database}).FEATURE_PRIOR_DB;
  await applyD1Migrations(db, env.TEST_MIGRATIONS.filter(m => !m.queries.some(sql => sql.includes('CREATE TABLE workspace_feature_switches'))));
  const now = new Date().toISOString(), token = createOpaqueToken();
  await db.prepare("INSERT INTO workspaces(id,name,mark,created_at,updated_at,revision_id) VALUES('synthetic-slate-1','Prior workspace','',?,?,'initial')").bind(now, now).run();
  await db.prepare("INSERT INTO members(id,workspace_id,email,display_name,initials,role,is_setup_owner,created_at,updated_at) VALUES('synthetic-slate-2','synthetic-slate-1','synthetic-slate-2@test.invalid','Prior owner','PO','owner',1,?,?)").bind(now, now).run();
  await db.prepare("INSERT INTO sessions(id,member_id,token_digest,created_at,updated_at,expires_at) VALUES('synthetic-slate-3','synthetic-slate-2',?,?,?,?)").bind(await sessionDigest(env.SESSION_SECRET!, token), now, now, new Date(Date.now() + 86400000).toISOString()).run();
  const before = (await db.prepare('SELECT * FROM workspaces').all()).results;
  await applyD1Migrations(db, env.TEST_MIGRATIONS);
  expect((await db.prepare('SELECT * FROM workspaces').all()).results).toEqual(before);
  const response = await createApi().request(env.APP_URL! + '/api/workspace/features', {headers: {cookie: `slate_session=${token}`}}, {...env, DB: db, SLATE_PROFILE: undefined});
  expect(response.status).toBe(200);
  expect((await response.json<{items: SwitchState[]}>()).items.every(state => !state.enabled && state.changedAt === null)).toBe(true);
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
}

export async function featureSwitchCustody(api: ReturnType<typeof createApi>, f: {workspaceId: string; memberId: string}) {
  await env.DB.prepare('UPDATE members SET is_setup_owner=1 WHERE id=?').bind(f.memberId).run();
  const cookie = await sessionFor(f.memberId, {freshProof: true});
  const email = await env.DB.prepare('SELECT email FROM members WHERE id=?').bind(f.memberId).first<string>('email');
  const request = (path: string, method = 'GET', body?: unknown, actorCookie = cookie) => api.request(env.APP_URL! + path, {method, headers: {cookie: actorCookie, ...(body === undefined ? {} : {'content-type': 'application/json'})}, body: body === undefined ? undefined : JSON.stringify(body)}, {...env, SLATE_PROFILE: undefined});
  expect((await request('/api/workspace/features', 'PUT', {operationKey: crypto.randomUUID(), key: 'mcp', enabled: true})).status).toBe(200);
  const retained = (await env.DB.prepare('SELECT * FROM workspace_feature_switches ORDER BY switch_key').all()).results;
  const exported = await request('/api/exports/workspace', 'POST', {operationKey: crypto.randomUUID()});
  expect(exported.status, exported.ok ? '' : JSON.stringify(await exported.json())).toBe(200);
  const job = await exported.json<{id: string}>();
  const downloaded = await request(`/api/exports/${job.id}/download`);
  expect(downloaded.status).toBe(200);
  const bytes = await downloaded.arrayBuffer();
  await resetDeployment();
  const target = await seedWorkspace();
  const owner = await seedMember(target.workspaceId, {email: email!, displayName: 'Restoring owner', role: 'owner', isSetupOwner: true});
  const targetCookie = await sessionFor(owner.memberId, {freshProof: true});
  const form = new FormData(); form.set('file', new File([bytes], 'synthetic-slate-1.zip', {type: 'application/zip'}));
  const restored = await api.request(env.APP_URL! + '/api/exports/restore', {method: 'POST', headers: {cookie: targetCookie}, body: form}, {...env, SLATE_PROFILE: undefined});
  expect(restored.status, restored.ok ? '' : JSON.stringify(await restored.json())).toBe(200);
  expect((await env.DB.prepare('SELECT * FROM workspace_feature_switches ORDER BY switch_key').all()).results).toEqual(retained);
  const restoredCookie = await sessionFor(f.memberId, {freshProof: true});
  expect((await request('/api/agent/tools', 'GET', undefined, restoredCookie)).status).toBe(200);

  const other = await seedMember(f.workspaceId, {email: crypto.randomUUID() + '@test.invalid', role: 'owner', displayName: 'synthetic-slate-4'});
  const otherCookie = await sessionFor(other.memberId, {freshProof: true});
  expect((await request('/api/workspace/features', 'PUT', {operationKey: crypto.randomUUID(), key: 'mcp', enabled: false}, otherCookie)).status).toBe(200);
  const changed = await env.DB.prepare("SELECT * FROM workspace_feature_switches WHERE switch_key='mcp'").first<{enabled: number; changed_at: string; changed_by_member_id: string | null}>();
  expect(changed?.changed_by_member_id).toBe(other.memberId);
  const erased = await request('/api/members/remove', 'POST', {operationKey: crypto.randomUUID(), memberId: other.memberId, erase: true}, restoredCookie);
  expect(erased.status, erased.ok ? '' : JSON.stringify(await erased.json())).toBe(200);
  expect(await env.DB.prepare("SELECT enabled,changed_at,changed_by_member_id FROM workspace_feature_switches WHERE switch_key='mcp'").first()).toEqual({enabled: changed!.enabled, changed_at: changed!.changed_at, changed_by_member_id: null});
  expect((await request('/api/agent/tools', 'GET', undefined, restoredCookie)).status).toBe(403);
  expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
}
