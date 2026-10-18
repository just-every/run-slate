import { env } from 'cloudflare:test';
import { beforeEach, expect } from 'vitest';
import { createApi } from '../../../src/core/app/hono';
import { contract } from '../contract';
import { resetDeployment } from '../setup/reset-deployment';
import { seedWorkspace, seedMember, seedContainer, seedContainerGrant, sessionFor } from '../setup/fixtures';

beforeEach(resetDeployment);
contract('PAGE-014', 'page and comment reactions identify each member, toggle independently and never notify or count as views', async () => {
  const { workspaceId } = await seedWorkspace();
  const { memberId: owner } = await seedMember(workspaceId, { role: 'owner', email: 'owner@slate.test', displayName: 'Alex Owner', isSetupOwner: true });
  const { memberId: reader } = await seedMember(workspaceId, { role: 'member', email: 'reader@slate.test', displayName: 'Morgan Reader' });
  const { memberId: denied } = await seedMember(workspaceId, { role: 'member', email: 'other@slate.test', displayName: 'Other Member' });
  const { containerId } = await seedContainer(workspaceId, { ownerMemberId: owner, visibility: 'private' });
  for (const [principalId, level] of [[owner, 'full'], [reader, 'view']] as const) await seedContainerGrant(containerId, { principalKind: 'member', principalId, level });
  const cookies = { owner: await sessionFor(owner), reader: await sessionFor(reader), denied: await sessionFor(denied) };
  const api = createApi();
  const request = (method: string, path: string, body?: unknown, actor: keyof typeof cookies = 'owner') => api.request('https://slate.test/api' + path, { method, headers: { cookie: cookies[actor], origin: 'https://slate.test', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }, { ...env, SLATE_PROFILE: undefined });
  const json = async (method: string, path: string, body?: unknown, actor: keyof typeof cookies = 'owner') => {
    const response = await request(method, path, body, actor); const data = await response.json<any>();
    expect(response.status, JSON.stringify(data)).toBe(200); return data;
  };
  const page = (await json('POST', '/pages', { operationKey: crypto.randomUUID(), containerId, title: 'Incident handover' })).value.pageId;
  const comment = (await json('POST', `/comments/page/${page}`, { operationKey: crypto.randomUUID(), body: [{ text: 'Recovery confirmed.' }] })).value.id;
  const beforeViews = await json('GET', `/analytics?pageId=${page}`);
  const notices = await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications').first<number>('n');
  const react = (actor: keyof typeof cookies, commentId?: string, remove = false) => json('POST', `/comments/page/${page}/reaction`, { operationKey: crypto.randomUUID(), emoji: '🎉', ...(commentId ? { commentId } : {}), remove }, actor);
  await react('owner'); await react('reader'); await react('reader', comment);
  await react('reader'); // A second add is not a second reaction.
  const listed = (await json('GET', `/comments/page/${page}`, undefined, 'reader')).reactions;
  expect(listed.map((r: any) => [r.memberId, r.displayName, r.commentId, r.emoji]).sort()).toEqual([[owner, 'Alex Owner', null, '🎉'], [reader, 'Morgan Reader', null, '🎉'], [reader, 'Morgan Reader', comment, '🎉']].sort());
  await react('reader', undefined, true);
  expect((await json('GET', `/comments/page/${page}`)).reactions).toHaveLength(2);
  await react('reader', comment, true); await react('owner', undefined, true);
  expect((await json('GET', `/comments/page/${page}`)).reactions).toEqual([]);
  expect(await json('GET', `/analytics?pageId=${page}`)).toEqual(beforeViews);
  expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications').first<number>('n')).toBe(notices);
  expect((await request('GET', `/comments/page/${page}`, undefined, 'denied')).status).toBe(404);
  expect((await request('POST', `/comments/page/${page}/reaction`, { operationKey: crypto.randomUUID(), emoji: '👍' }, 'denied')).status).toBe(404);
  const other = (await json('POST', '/pages', { operationKey: crypto.randomUUID(), containerId, title: 'Other record' })).value.pageId;
  expect((await request('POST', `/comments/page/${other}/reaction`, { operationKey: crypto.randomUUID(), emoji: '👍', commentId: comment })).status).toBe(404);
});
