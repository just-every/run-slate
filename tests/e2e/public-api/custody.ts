import { env, applyD1Migrations } from 'cloudflare:test';
import { expect } from 'vitest';
import type { D1Migration } from '@cloudflare/vitest-pool-workers';
import { createUlid } from '../../../src/core/shared/ulid';
import { createOpaqueToken, sessionDigest } from '../../../src/core/platform/auth/token';
import { decodeArchive } from '../../../src/core/features/portability/archive';
import type { apiFixture } from './support';

export async function tokenCustody(f: Pick<Awaited<ReturnType<typeof apiFixture>>, 'api' | 'owner' | 'ok' | 'cookies'>, secret: string, otherSecrets: string[] = []) {
  const prior = (env as unknown as { PRIOR_DB: D1Database }).PRIOR_DB;
  const migrations = env.TEST_MIGRATIONS as D1Migration[];
  await applyD1Migrations(prior, migrations.filter(m => !/(?:public_api_tokens|webhook_subscriptions|audit_stream|scim_directory)\.sql$/.test(m.name)));
  const now = new Date().toISOString(), ownerId = createUlid(), workspaceId = createUlid();
  await prior.batch([
    prior.prepare('INSERT INTO workspaces(id,name,mark,created_at,updated_at,revision_id) VALUES(?,?,?, ?,?,?)').bind(workspaceId, 'Synthetic restore', 'SR', now, now, createUlid()),
    prior.prepare("INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,status,is_setup_owner,created_at,updated_at) VALUES(?,?,?,'Synthetic owner','SO','owner','member','active',1,?,?)").bind(ownerId, workspaceId, 'synthetic-slate-1@example.test', now, now),
  ]);
  const before = (await prior.prepare('SELECT * FROM members').all()).results;
  await applyD1Migrations(prior, migrations.filter(m => /(?:public_api_tokens|webhook_subscriptions|audit_stream|scim_directory)\.sql$/.test(m.name)));
  expect((await prior.prepare('SELECT * FROM members').all()).results).toEqual(before);
  const exported = await f.ok('/api/exports/workspace', 'POST', { operationKey: createUlid() });
  const download = await f.api.request(`https://slate.test/api/exports/${exported.id}/download`, { headers: { cookie: f.cookies[f.owner]! } }, {...env,SLATE_PROFILE:undefined});
  expect(download.status).toBe(200);
  const bytes = new Uint8Array(await download.arrayBuffer()), { manifest } = await decodeArchive(bytes);
  const settings=manifest.tables.audit_settings??[];
  expect(manifest.tables.public_api_tokens!.length).toBeGreaterThan(0);
  expect(manifest.tables.public_api_tokens!.every(row => row.token_hash === null)).toBe(true);
  for(const value of [secret,...otherSecrets])expect(JSON.stringify(manifest).includes(value)).toBe(false);
  expect((manifest.tables.scim_credentials??[]).every(row=>row.token_hash===null)).toBe(true);
  expect((manifest.tables.webhook_subscriptions??[]).every(row=>row.credential_ciphertext===null)).toBe(true);
  const session = createOpaqueToken(), proof = Date.now();
  await prior.prepare("INSERT INTO sessions(id,member_id,token_digest,created_at,updated_at,expires_at,kind,authority_version,proof_at,proof_version) VALUES(?,?,?,?,?,?,'native',1,?,1)").bind(createUlid(), ownerId, await sessionDigest(env.SESSION_SECRET!, session), now, now, new Date(proof + 86400000).toISOString(), proof).run();
  const form = new FormData(); form.set('file', new File([bytes], 'synthetic-slate-archive.zip', { type: 'application/zip' }));
  const restored = await f.api.request('https://slate.test/api/exports/restore', { method: 'POST', headers: { cookie: `slate_session=${session}` }, body: form }, { ...env, DB: prior, SLATE_PROFILE:undefined });
  expect(restored.status, JSON.stringify(await restored.json())).toBe(200);
  expect((await prior.prepare('SELECT * FROM audit_settings').all()).results).toEqual(settings);
  const restoredTokens = (await prior.prepare('SELECT token_hash,revoked_at FROM public_api_tokens').all()).results;
  expect(restoredTokens.length).toBeGreaterThan(0);
  expect((await prior.prepare('SELECT credential_ciphertext,state FROM webhook_subscriptions').all()).results.every(row=>row.credential_ciphertext===null&&row.state==='disabled')).toBe(true);
  expect(restoredTokens.every(row => row.token_hash === null && row.revoked_at !== null)).toBe(true);
  expect((await f.api.request('https://slate.test/api/v1/pages', { headers: { authorization: `Bearer ${secret}` } }, { ...env, DB: prior, SLATE_PROFILE:undefined })).status).toBe(401);
}
