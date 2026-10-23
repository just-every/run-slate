import { env } from 'cloudflare:test';
import { expect } from 'vitest';
import { createApi } from '../../../src/core/app/hono';
import { seedWorkspace, seedMember, seedContainer, seedContainerGrant, sessionFor } from '../setup/fixtures';
import { createUlid } from '../../../src/core/shared/ulid';

export async function apiFixture() {
  const api = createApi(), { workspaceId } = await seedWorkspace();
  const owner = (await seedMember(workspaceId, { role: 'owner', email: 'synthetic-slate-1@example.test', displayName: 'Synthetic owner', isSetupOwner: true })).memberId;
  const member = (await seedMember(workspaceId, { role: 'member', email: 'synthetic-slate-2@example.test', displayName: 'Synthetic member' })).memberId;
  const other = (await seedMember(workspaceId, { role: 'member', email: 'synthetic-slate-3@example.test', displayName: 'Synthetic colleague' })).memberId;
  const guest = (await seedMember(workspaceId, { role: 'member', email: 'synthetic-slate-4@example.test', displayName: 'Synthetic guest', isGuest: true })).memberId;
  const { containerId } = await seedContainer(workspaceId, { ownerMemberId: owner, visibility: 'private' });
  await seedContainerGrant(containerId, { principalKind: 'member', principalId: owner, level: 'full' });
  const grant = await seedContainerGrant(containerId, { principalKind: 'member', principalId: member, level: 'edit' });
  const cookies = Object.fromEntries(await Promise.all([owner, member, other, guest].map(async id => [id, await sessionFor(id, { freshProof: true })])));
  const request = async (path: string, method = 'GET', body?: unknown, credentials: { member?: string; token?: string } = { member: owner }) => {
    const response = await api.request('https://slate.test' + path, { method, headers: { 'content-type': 'application/json', ...(credentials.member ? { cookie: cookies[credentials.member]! } : {}), ...(credentials.token ? { authorization: `Bearer ${credentials.token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, {...env,SLATE_PROFILE:undefined});
    return { status: response.status, data: await response.json<any>(), headers: response.headers };
  };
  const ok = async (...args: Parameters<typeof request>) => { const r = await request(...args); expect(r.status, JSON.stringify(r.data)).toBe(200); return r.data; };
  const mint = async (actor = owner, level = 'write') => ok('/api/developer/tokens', 'POST', { operationKey: createUlid(), name: 'synthetic-slate-token', scopes: [{ containerId, level }] }, { member: actor });
  const share = async (pageId: string, memberId: string) => ok('/api/sharing', 'POST', { operationKey: createUlid(), targetKind: 'page', targetId: pageId, principalKind: 'member', principalId: memberId, level: 'edit' });
  return { api, owner, member, other, guest, workspaceId, containerId, grant, cookies, request, ok, mint, share };
}

/** Only schema vocabulary emitted by the served specification is needed here. */
export function assertSchema(schema: any, value: any): void {
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    expect(types.some((type: string) => type === 'null' ? value === null : type === 'array' ? Array.isArray(value) : type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value) : typeof value === type), `schema type ${types}`).toBe(true);
  }
  for (const required of schema.required ?? []) expect(value).toHaveProperty(required);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, nested] of Object.entries(schema.properties ?? {})) if (Object.hasOwn(value, key)) assertSchema(nested, value[key]);
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) expect(Object.keys(schema.properties ?? {})).toContain(key);
  }
  if (Array.isArray(value) && schema.items) for (const item of value) assertSchema(schema.items, item);
}
