import { env, applyD1Migrations } from 'cloudflare:test';
import { test, expect } from 'vitest';
import { createOpaqueToken, sessionDigest } from '../../../src/core/platform/auth/token';
import { readRuntimeConfig } from '../../../src/core/platform/config/runtime';
import { captureMail } from '../../e2e/helpers/mail-edge';
import { priorIdentityFixture } from './identity-prior-fixture';
import { providerEdge } from './identity-provider-fixture';

type Fixture = Awaited<ReturnType<typeof priorIdentityFixture>>;
const project = (rows: unknown[], like: unknown[]) => {
  const columns = Object.keys((like[0] ?? {}) as object);
  return (rows as Record<string, unknown>[]).map(row => Object.fromEntries(columns.map(column => [column, row[column]])));
};
function http(fixture: Fixture) {
  const { api, origin, bindings } = fixture, host = new URL(origin).host;
  bindings.MAIL_PROVIDER = 'resend';
  bindings.MAIL_API_KEY = 'test-only-mail-key';
  const mail = captureMail();
  return {
    host,
    get: (path: string, cookie?: string) => api.request(origin + path, { headers: { host, ...(cookie ? { cookie } : {}) } }, bindings),
    send: (method: string, path: string, body: unknown, cookie?: string, from = origin) => api.request(origin + path, { method, headers: { host, origin: from, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }, bindings),
    confirm: (token: string, cookie?: string, from = origin) => api.request(origin + '/auth/confirm', { method: 'POST', headers: { host, origin: from, 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) }, body: new URLSearchParams({ token }) }, bindings),
    /** The newest outbox message for an address, opened as a person would. */
    async latestLink(email: string) {
      const link = mail.latestLink(email);
      expect(link.origin + link.pathname).toBe(origin + '/auth/confirm');
      return link.searchParams.get('token')!;
    },
  };
}
const cookieOf = (response: Response) => response.headers.getSetCookie().find(value => value.startsWith('slate_session='))!.split(';')[0]!;

test('published v0.1.0 members, groups, guests and live sessions keep identity, access and authority through Base sign-in adoption', async () => {
  const fixture = await priorIdentityFixture();
  const { db, owner, member, before } = fixture;
  // A v0.1.0 GET link, still unused at upgrade time.
  const old = createOpaqueToken(), config = readRuntimeConfig(fixture.bindings, true);
  await db.prepare('INSERT INTO magic_links (id,email,token_digest,expires_at,created_at) VALUES (?,?,?,?,?)').bind('old-unused-link', 'prior-owner@example.org', await sessionDigest(config.sessionSecret, old), '2099-01-01T00:00:00.000Z', new Date().toISOString()).run();
  await applyD1Migrations(db, env.TEST_MIGRATIONS);
  for (const table of Object.keys(before)) expect(project((await db.prepare(`SELECT * FROM ${table}`).all()).results, before[table]!), table).toEqual(before[table]);
  // access() asserts the v0.1.0 access table: owner/member/guest sessions, group administration, allowed and denied pages.
  const priorAccess = await fixture.access();
  const web = http(fixture);

  // Earlier links never become credentials.
  const retired = await web.get('/api/auth/magic/accept?token=' + old);
  expect(retired.status).toBe(400); expect(await retired.text()).toContain('href="/signin"'); expect(retired.headers.get('set-cookie')).toBeNull();
  expect((await web.confirm(old)).status).toBe(400);
  expect((await db.prepare('SELECT used_at FROM magic_links WHERE id=?').bind('old-unused-link').first())?.used_at).toBeNull();

  // Email: Base proof, inert preview, same-origin POST, one use.
  expect((await web.send('POST', '/api/auth/magic', { email: 'prior-owner@example.org' })).status).toBe(200);
  const token = await web.latestLink('prior-owner@example.org');
  const preview = await web.get('/auth/confirm?token=' + token);
  expect(preview.status).toBe(200); expect(await preview.text()).toContain('<form method="post"'); expect(preview.headers.get('set-cookie')).toBeNull();
  expect((await web.confirm(token, undefined, 'https://other.example.org')).status).not.toBe(303);
  const accepted = await web.confirm(token);
  expect(accepted.status).toBe(303); expect(accepted.headers.get('location')).toBe('/app');
  const emailSession = await web.get('/api/session', cookieOf(accepted));
  expect(await emailSession.json()).toMatchObject({ member: { id: owner.memberId, role: 'owner' } });
  expect((await web.confirm(token)).status).toBe(400);

  // Provider: the incumbent issuer/client/callback, now pinned; first sign-in binds the verified mailbox's member.
  const provider = await providerEdge(fixture);
  try {
    const flow = await provider.signIn({ subject: 'prior-provider-subject', email: 'prior-member@example.org' });
    expect((await fixture.api.request(flow.url, { headers: { host: web.host } }, fixture.bindings)).status).toBe(400);
    const completed = await flow.complete();
    expect(completed.status).toBe(303); expect(completed.headers.get('location')).toBe('/app');
    expect(await (await web.get('/api/session', cookieOf(completed))).json()).toMatchObject({ member: { id: member.memberId, role: 'member' } });
    expect((await flow.complete()).status).toBe(400);
    expect((await db.prepare('SELECT issuer,subject,member_id FROM member_identity_bindings').all()).results)
      .toEqual([{ issuer: fixture.bindings.IDENTITY_ISSUER_URL, subject: 'prior-provider-subject', member_id: member.memberId }]);
    // A bound subject asserting the owner's mailbox is refused, and the binding never moves: nobody gains authority.
    const moved = await (await provider.signIn({ subject: 'prior-provider-subject', email: 'prior-owner@example.org' })).complete();
    expect(moved.status).toBe(403); expect(moved.headers.getSetCookie().some(value => value.startsWith('slate_session='))).toBe(false);
    const row = await db.prepare("SELECT kind,authority_version,issuer,created_at,expires_at FROM sessions WHERE kind='oidc' LIMIT 1").first<{ created_at: string; expires_at: string }>();
    expect(Date.parse(row!.expires_at) - Date.parse(row!.created_at)).toBeLessThanOrEqual(86_400_000);
  } finally { provider.restore(); }

  expect(await fixture.access()).toEqual(priorAccess);
  for (const table of ['members', 'groups', 'group_members', 'container_grants', 'pages', 'page_revisions']) expect(project((await db.prepare(`SELECT * FROM ${table}`).all()).results, before[table]!), table).toEqual(before[table]);
  expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);

  // Ownership changes need a fresh email step-up in the asking session, and end
  // fenced sessions of the changed member.
  const { cookies } = fixture;
  // A post-upgrade email session for the member; their v0.1.0 session stays as it was.
  expect((await web.send('POST', '/api/auth/magic', { email: 'prior-member@example.org' })).status).toBe(200);
  const memberFresh = cookieOf(await web.confirm(await web.latestLink('prior-member@example.org')));
  const promote = () => web.send('PUT', `/api/members/${member.memberId}/role`, { operationKey: 'promote-' + crypto.randomUUID(), expectedRole: 'member', role: 'owner' }, cookies.owner);

  const refused = await promote();
  expect(refused.status).toBe(403); expect(await refused.json()).toMatchObject({ code: 'STEP_UP_REQUIRED' });
  const challenge = await web.latestLink('prior-owner@example.org');
  expect(await (await web.get('/auth/confirm?token=' + challenge)).text()).toContain('<form method="post"');
  // A step-up link completes only in the session that asked for it.
  expect((await web.confirm(challenge, cookies.member)).status).toBe(400);
  const confirmed = await web.confirm(challenge, cookies.owner);
  expect(confirmed.status).toBe(303); expect(confirmed.headers.get('set-cookie')).toBeNull();
  expect((await web.confirm(challenge, cookies.owner)).status).toBe(400);

  const promoted = await promote();
  expect(promoted.status).toBe(200);
  expect(await db.prepare('SELECT m.role,a.version FROM members m JOIN member_authority a ON a.member_id=m.id WHERE m.id=?').bind(member.memberId).first()).toEqual({ role: 'owner', version: 2 });
  // The new-style session was issued at the old authority version; the v0.1.0 session keeps its native contract.
  expect((await web.get('/api/session', memberFresh)).status).toBe(401);
  expect(await (await web.get('/api/session', cookies.member)).json()).toMatchObject({ member: { id: member.memberId, role: 'owner' } });
  expect(await (await web.get('/api/session', cookies.owner)).json()).toMatchObject({ member: { id: owner.memberId } });
});

