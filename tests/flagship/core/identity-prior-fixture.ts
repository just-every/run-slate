import { env, applyD1Migrations } from 'cloudflare:test';
import { expect } from 'vitest';
import { createApi } from '../../../src/core/app/hono';
import { seedWorkspace, seedMember, seedGroup, seedContainer, seedContainerGrant, seedPage, sessionFor } from '../../e2e/setup/fixtures';

/** Populate a store at the published v0.1.0 schema (migrations through 0017) with native identities, content and scoped grants. */
export async function priorIdentityFixture() {
  const db = (env as unknown as { PRIOR_DB: D1Database }).PRIOR_DB;
  await applyD1Migrations(db, env.TEST_MIGRATIONS.filter(m => m.name < '0018'));
  const { workspaceId } = await seedWorkspace();
  const owner = await seedMember(workspaceId, { role: 'owner', email: 'prior-owner@example.org', displayName: 'Prior owner' });
  const guest = await seedMember(workspaceId, { role: 'member', isGuest: true, email: 'prior-guest@example.org', displayName: 'Prior guest' });
  const member = await seedMember(workspaceId, { role: 'member', email: 'prior-member@example.org', displayName: 'Prior member' });
  const group = await seedGroup(workspaceId, { name: 'Prior group', memberIds: [owner.memberId, member.memberId] });
  const pages = [];
  for (const name of ['Guest page', 'Group page', 'Owner page']) {
    const container = await seedContainer(workspaceId, { ownerMemberId: owner.memberId, visibility: 'private', name });
    await seedContainerGrant(container.containerId, { principalKind: 'member', principalId: owner.memberId, level: 'full' });
    const page = await seedPage(container.containerId, { authorMemberId: owner.memberId, title: name });
    await env.DB.prepare('INSERT INTO page_revisions (id,page_id,author_member_id,origin,content_hash,body_json,properties_json,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(page.workingRevisionId, page.pageId, owner.memberId, 'autosave', name, '[]', JSON.stringify({ title: name, labels: [] }), new Date().toISOString()).run();
    pages.push(page);
  }
  const [guestPage, groupPage, ownerPage] = pages;
  await seedContainerGrant(guestPage!.containerId, { principalKind: 'member', principalId: guest.memberId, level: 'view' });
  await seedContainerGrant(groupPage!.containerId, { principalKind: 'group', principalId: group.groupId, level: 'view' });
  const cookies = { owner: await sessionFor(owner.memberId), guest: await sessionFor(guest.memberId), member: await sessionFor(member.memberId) };
  const before: Record<string, unknown[]> = {};
  const tables = ['workspaces', 'members', 'groups', 'group_members', 'containers', 'container_owners', 'container_members', 'container_grants', 'pages', 'page_revisions', 'content_published_revisions', 'sessions'];
  for (const table of tables) {
    before[table] = (await env.DB.prepare(`SELECT * FROM ${table}`).all()).results;
    // The prior schema has only its own columns; head-only columns are dropped from the copy and the snapshot.
    const prior = new Set((await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()).results.map(column => column.name));
    before[table] = (before[table] as Record<string, unknown>[]).map(row => Object.fromEntries(Object.entries(row).filter(([column]) => prior.has(column))));
    for (const row of before[table] as Record<string, unknown>[]) {
      const columns = Object.keys(row);
      await db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).bind(...Object.values(row)).run();
    }
  }
  const origin = 'http://localhost:8787';
  const issuer = 'https://prior-provider.example.org';
  // The incumbent provider keeps its issuer, client and callback; upgrade adds its exact endpoint pins.
  const bindings = { ...env, DB: db, APP_URL: origin, LOCAL_DEVELOPMENT: 'true', MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'test-only-mail-key', RER_DEV_KEY: 'test-only-dev-key-'.padEnd(43, 'k'),
    SSO_ENABLED: 'true', IDENTITY_ISSUER_URL: issuer, IDENTITY_CLIENT_ID: 'prior-client', IDENTITY_CLIENT_SECRET: 'test-only-prior-client-secret',
    IDENTITY_AUTHORIZATION_ENDPOINT: issuer + '/authorize', IDENTITY_TOKEN_ENDPOINT: issuer + '/token', IDENTITY_JWKS_URI: issuer + '/keys',
    IDENTITY_TRANSACTION_SECRET: 'test-only-prior-transaction-secret-32+' };
  const api = createApi();
  async function access() {
    const responses: Record<string, unknown> = {};
    async function read(label: string, path: string, cookie: string, status: number) {
      const response = await api.request(origin + path, { headers: { cookie, host: new URL(origin).host } }, bindings);
      expect(response.status, label).toBe(status);
      const body = await response.json();
      responses[label] = body;
      return body;
    }
    for (const [name, identity] of Object.entries({ owner, guest, member })) {
      const session = await read(`${name} session`, '/api/session', cookies[name as keyof typeof cookies], 200) as { member: { id: string } };
      expect(session.member.id).toBe(identity.memberId);
    }
    const groups = await read('owner groups', '/api/groups', cookies.owner, 200) as { items: { id: string; memberIds: string[] }[] };
    expect(groups.items).toHaveLength(1);
    expect(groups.items[0]).toMatchObject({ id: group.groupId, memberIds: [owner.memberId, member.memberId].sort() });
    await read('guest groups denied', '/api/groups', cookies.guest, 403);
    await read('member groups denied', '/api/groups', cookies.member, 403);
    for (const [name, page] of Object.entries({ guest: guestPage!, member: groupPage!, owner: ownerPage! })) {
      for (const [reader, cookie] of Object.entries(cookies)) {
        const allowed = reader === 'owner' || reader === name;
        const body = await read(`${reader} reads ${name} page`, '/api/pages/' + page.pageId, cookie, allowed ? 200 : 404) as { page: { id: string }; permissions: { canEdit: boolean } };
        if (allowed) { expect(body.page.id).toBe(page.pageId); expect(body.permissions.canEdit).toBe(reader === 'owner'); }
      }
    }
    return responses;
  }
  return { db, origin, api, bindings, before, access, owner, guest, member, cookies };
}
