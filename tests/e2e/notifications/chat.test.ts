import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, expect, test, vi } from 'vitest';
import { contract } from '../contract';
import { resetDeployment } from '../setup/reset-deployment';
import { seedWorkspace, seedMember, seedContainer, seedContainerGrant, sessionFor } from '../setup/fixtures';
import { createApi } from '../../../src/core/app/hono';
import worker from '../../../src/server';
import type { AppBindings } from '../../../src/core/app/types';
import { handleApplicationRequest } from '../../../src/core/app/request-handler';
import { healthResponse } from '../../../src/core/app/health-response';
import { assertStoredConfiguration } from '../../../src/core/app/runtime-gate';
import { decryptSecret } from '../../../src/core/platform/secrets/custody';
import { chatScope } from '../../../src/core/features/notifications/chat-config';
import { slackNetwork, type SlackAudienceFixture } from '../helpers/slack-network';
import { captureMail } from '../helpers/mail-edge';

beforeEach(resetDeployment);
test("NOTIF-003 — chat admission requires fresh authority and keeps link-only delivery inside the current audience", async () => {
  // Each row retains its original fixture and every assertion.
  const cases = [
    { name: 'Chat destination sends link-only messages, shows last delivery and failure, retries only transient failures, marks revoked authorization as needing attention and stops on disconnect', run: async () => {
  const { workspaceId } = await seedWorkspace();
  const owner = (await seedMember(workspaceId, { role: 'owner', email: 'owner\x40chat.test', displayName: 'Alex Owner' })).memberId;
  const reader = (await seedMember(workspaceId, { role: 'member', email: 'reader\x40chat.test', displayName: 'Morgan Reader' })).memberId;
  await seedMember(workspaceId, { role: 'member', email: 'removed\x40chat.test', displayName: 'Former Reader', status: 'removed' });
  const containerId = (await seedContainer(workspaceId, { ownerMemberId: owner, visibility: 'private' })).containerId;
  for (const [principalId, level] of [[owner, 'full'], [reader, 'comment']] as const) await seedContainerGrant(containerId, { principalKind: 'member', principalId, level });
  const cookies = { owner: await sessionFor(owner, { freshProof: true }), reader: await sessionFor(reader) };
  const token = 'test-only-chat-credential', credentialKey = crypto.randomUUID(), origin = 'https://slate.test';
  const bindings: AppBindings = { ...env, SLATE_PROFILE: undefined, CONNECTOR_CREDENTIALS_KEY: credentialKey, APP_URL: origin };
  const app = createApi(), key = () => crypto.randomUUID();
  const raw = (method: string, path: string, body?: unknown, actor: keyof typeof cookies = 'owner', runtime = bindings) => app.request(origin + path, { method, headers: { cookie: cookies[actor], origin, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) }, runtime);
  const api = async (method: string, path: string, body?: unknown, actor: keyof typeof cookies = 'owner') => {
    const response = await raw(method, path, body, actor), text = await response.text();
    expect(text).not.toContain(token); expect(text).not.toContain('credential_ciphertext');
    expect(response.status, text).toBe(200); return JSON.parse(text);
  };
  const selected = ['comment', 'mention', 'published'];
  const edge = slackNetwork('reader\x40chat.test', token);
  const connection = async () => (await api('GET', '/api/notifications/chat')).connection;
  const history = async () => (await api('GET', '/api/notifications/chat/deliveries')).items;
  const connect = async () => api('POST', '/api/notifications/chat', { operationKey: key(), channel: 'GCHAT', token, events: selected, expectedRevisionId: (await connection())?.revisionId });
  const refusals: { name: string; audience: SlackAudienceFixture; reason: string; status: number }[] = [
    { name: 'public channel', audience: { channel: { is_private: false } }, reason: 'private_unshared_channel_required', status: 422 },
    { name: 'externally shared channel', audience: { channel: { is_ext_shared: true } }, reason: 'private_unshared_channel_required', status: 422 },
    { name: 'organization-shared channel', audience: { channel: { is_org_shared: true } }, reason: 'private_unshared_channel_required', status: 422 },
    { name: 'another bot', audience: { users: { READER: { profile: { email: 'reader\x40chat.test' } }, OTHERBOT: { is_bot: true, profile: { email: 'reader\x40chat.test' } } } }, reason: 'unverifiable_audience', status: 422 },
    { name: 'hidden email', audience: { users: { READER: { profile: {} } } }, reason: 'unverifiable_audience', status: 422 },
    { name: 'unmapped email', audience: { users: { READER: { profile: { email: 'unknown\x40chat.test' } } } }, reason: 'CHAT_AUDIENCE_UNMAPPED', status: 409 },
    { name: 'inactive Slate member', audience: { users: { READER: { profile: { email: 'removed\x40chat.test' } } } }, reason: 'CHAT_AUDIENCE_UNMAPPED', status: 409 },
  ];
  const drain = async () => {
  await env.DB.prepare("UPDATE chat_deliveries SET created_at=? WHERE state='pending' AND message_id IS NULL AND created_at>=?").bind(new Date(Date.now()-120000).toISOString(),new Date().toISOString().slice(0,10)).run();
  await env.DB.prepare("UPDATE notification_outbox SET created_at=? WHERE processed_at IS NULL").bind(new Date(Date.now()-120000).toISOString()).run();
    const ack = vi.fn(), retry = vi.fn();
    await worker.queue!({ queue: 'test-discovery', metadata: { metrics: { backlogCount: 1, backlogBytes: 0 } }, messages: [{ id: key(), body: { type: 'discovery.deliver' }, timestamp: new Date(), attempts: 1, ack, retry }], ackAll: vi.fn(), retryAll: vi.fn() } as MessageBatch<unknown>, bindings);
    expect(retry).not.toHaveBeenCalled(); expect(ack).toHaveBeenCalledOnce();
  };
  try {
    expect((await api('GET', '/api/profile')).profile).toBe('core-wiki');
    expect((await raw('POST', '/api/notifications/chat', { operationKey: key(), channel: 'GCHAT', token, events: selected }, 'reader')).status).toBe(403);
    for (const refusal of refusals) {
      edge.setAudience(refusal.audience);
      const response = await raw('POST', '/api/notifications/chat', { operationKey: key(), channel: 'GCHAT', token, events: selected });
      expect(response.status, refusal.name).toBe(refusal.status);
      const problem = await response.json<any>();
      expect(problem.code).toBe(refusal.status === 422 ? 'CHAT_DESTINATION_REFUSED' : refusal.reason);
      if (refusal.status === 422) { expect(problem.details.reason).toBe(refusal.reason); expect(problem.message).toBeTruthy(); }
      expect(JSON.stringify(problem)).not.toContain(token);
      expect(await connection(), refusal.name).toBeNull();
      expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM chat_connections').first<number>('count'), refusal.name).toBe(0);
      expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM discovery_revisions WHERE entity_kind='chat-connection'").first<number>('count'), refusal.name).toBe(0);
    }
    // The sending bot is excluded; a deactivated person needs neither a visible email nor a Slate account.
    const validAudience = { users: { READER: { profile: { email: 'reader\x40chat.test' } }, DEACTIVATED: { deleted: true } } };
    edge.setAudience(validAudience);
    const pageId = (await api('POST', '/api/pages', { operationKey: key(), containerId, title: 'Incident handover' })).value.pageId;
    const document = await api('GET', `/api/pages/${pageId}`);
    await api('PUT', `/api/pages/${pageId}/blocks`, { operationKey: key(), expectedRevisionId: document.page.revisionId, blocks: [{ id: key(), blockType: 'paragraph', treePosition: 'a', content: { text: [{ text: 'BODY MUST NEVER REACH SLACK' }] } }] });
    await drain(); // Events before connecting are not replayed.
    await connect();
    const first = await connection();
    const ciphertext = await env.DB.prepare('SELECT credential_ciphertext FROM chat_connections WHERE id=?').bind(first.id).first<string>('credential_ciphertext');
    expect(ciphertext).not.toContain(token);
    expect(await decryptSecret(credentialKey, ciphertext!, chatScope(workspaceId, first.id))).toBe(token);
    const comment = async (extra: Record<string, unknown> = {}) => (await api('POST', `/api/comments/page/${pageId}`, { operationKey: key(), body: [{ text: 'COMMENT BODY PRIVATE' }], ...extra })).value;
    for (const refusal of refusals) {
      edge.setAudience(refusal.audience);
      const priorHistory = await history(), sends = edge.attempts.filter(method => method === 'chat.postMessage').length;
      await comment(); await drain(); await drain();
      expect(edge.messages, refusal.name).toHaveLength(0);
      expect(edge.attempts.filter(method => method === 'chat.postMessage'), refusal.name).toHaveLength(sends);
      expect((await connection()).lastFailureReason, refusal.name).toBe(refusal.reason);
      const added = (await history()).filter((item: any) => !priorHistory.some((prior: any) => prior.id === item.id));
      expect(added, refusal.name).toHaveLength(1);
      expect(added[0]).toMatchObject({ state: 'failed', failure: refusal.reason, attempts: 1 });
    }
    edge.setAudience(validAudience);
    const discussion = await comment({ body: [{ text: 'Mention ', mention: { kind: 'person', id: reader, label: 'Morgan Reader' } }] });
    const current = await api('GET', `/api/pages/${pageId}`);
    await api('POST', `/api/pages/${pageId}/publish`, { operationKey: key(), expectedRevisionId: current.page.revisionId });
    await drain(); await drain();
    expect(edge.messages).toHaveLength(selected.length);
    for (const event of selected) {
      const messages = edge.messages.filter(m => m.text.startsWith(`${event} ·`));
      expect(messages).toHaveLength(1);
      expect(messages[0]!.text).toContain('Alex Owner'); expect(messages[0]!.text).toContain('Incident handover');
      expect(messages[0]!.text).toContain(`${origin}/app/pages/${pageId}`);
    }
    expect(JSON.stringify(edge.messages)).not.toMatch(/BODY MUST|COMMENT BODY/);
    await comment({ threadId: discussion.threadId, parentCommentId: discussion.id }); await drain();
    expect(edge.messages).toHaveLength(3); // reply was not selected.
    const delivered = await connection(); expect(delivered.lastDeliveredAt).toBeTruthy();
    expect((await history()).filter((d: any) => d.state === 'delivered')).toHaveLength(3);
    // A queued event loses access before delivery, including at the last membership check.
    await comment();
    await env.DB.prepare('UPDATE container_grants SET revoked_at=? WHERE container_id=? AND principal_id=?').bind(new Date().toISOString(), containerId, reader).run();
    await drain(); expect(edge.messages).toHaveLength(3);
    expect((await raw('GET', `/api/pages/${pageId}`, undefined, 'reader')).status).toBe(404);
    expect((await app.request(origin + `/api/pages/${pageId}`, {}, bindings)).status).toBe(401);
    const execution = createExecutionContext();
    const linked = await handleApplicationRequest(new Request(origin + `/app/pages/${pageId}`), bindings, execution);
    expect(linked.status).toBe(302); expect(linked.headers.get('location')).toContain('/signin');
    await waitOnExecutionContext(execution);
    await env.DB.prepare('UPDATE container_grants SET revoked_at=NULL WHERE container_id=? AND principal_id=?').bind(containerId, reader).run();
    // Explicit rate limiting is safe to retry; a permanent rejection is not.
    await comment(); edge.fail('transient'); await drain();
    const failed = await connection(); expect(failed.lastFailureReason).toBe('rate_limited'); expect(failed.lastFailedAt).toBeTruthy();
    expect(failed.lastDeliveredAt).toBe(delivered.lastDeliveredAt);
    expect((await history()).filter((d: any) => d.state === 'pending')).toHaveLength(1);
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.now() + 61_000);
    await drain(); await drain(); expect(edge.messages).toHaveLength(4);
    await comment(); edge.fail('permanent'); await drain();
    const attempted = edge.attempts.filter(m => m === 'chat.postMessage').length;
    vi.setSystemTime(Date.now() + 61_000); await drain();
    expect(edge.attempts.filter(m => m === 'chat.postMessage')).toHaveLength(attempted);
    expect((await connection()).lastFailureReason).toBe('channel_not_found');
    expect((await history()).some((d: any) => d.failure === 'channel_not_found' && d.attempts === 1)).toBe(true);
    for (const mode of ['revoked', 'expired'] as const) {
      edge.fail(undefined); await connect(); const priorHistory = await history();
      await comment(); edge.fail(mode); await drain();
      const attention = await connection();
      expect(attention.id).toBe(first.id); expect(attention.state).toBe('needs-attention');
      expect(attention.needsAttentionReason).toBe(mode === 'revoked' ? 'token_revoked' : 'token_expired');
      expect(JSON.parse(attention.eventsJson)).toEqual(selected); expect(attention.lastDeliveredAt).toBeTruthy();
      expect((await history()).length).toBeGreaterThanOrEqual(priorHistory.length);
      const calls = edge.attempts.length; await comment(); await drain(); expect(edge.attempts).toHaveLength(calls);
    }
    edge.fail(undefined); await connect();
    const resumed = await connection(); expect(resumed.id).toBe(first.id); expect(resumed.state).toBe('connected');
    expect(JSON.parse(resumed.eventsJson)).toEqual(selected); expect(resumed.lastFailureReason).toBe('token_expired');
    // Restart/startup configuration validation refuses the same connected store by name.
    const missingKey = { ...bindings, CONNECTOR_CREDENTIALS_KEY: undefined };
    await expect(assertStoredConfiguration(missingKey)).rejects.toThrow('CONNECTOR_CREDENTIALS_KEY');
    const unavailable = await raw('GET', '/api/notifications/chat', undefined, 'owner', missingKey);
    expect(unavailable.status).toBe(503); expect(await unavailable.text()).toContain('CONNECTOR_CREDENTIALS_KEY');
    const startup = createExecutionContext();
    const documentFailure = await handleApplicationRequest(new Request(origin + '/app/settings'), missingKey, startup);
    expect(documentFailure.status).toBe(503); expect(await documentFailure.text()).toContain('CONNECTOR_CREDENTIALS_KEY');
    await healthResponse(new Request(origin + '/health'), missingKey, startup);
    await waitOnExecutionContext(startup);
    const health = await healthResponse(new Request(origin + '/health'), missingKey, createExecutionContext());
    expect(health.status).toBe(503); expect(await health.text()).toContain('CONNECTOR_CREDENTIALS_KEY');
    // Disconnect during membership lookup wins before the transport dispatch claim.
    await comment();
    edge.duringAudience(async () => { await api('DELETE', `/api/notifications/chat/${first.id}`, { operationKey: key(), expectedRevisionId: resumed.revisionId }); });
    const sends = edge.messages.length; await drain(); await comment(); await drain(); expect(edge.messages).toHaveLength(sends);
    expect((await connection()).state).toBe('disconnected');
    expect(await env.DB.prepare('SELECT credential_ciphertext FROM chat_connections WHERE id=?').bind(first.id).first('credential_ciphertext')).toBeNull();
    expect((await history()).length).toBeGreaterThanOrEqual(3);
    await expect(assertStoredConfiguration(missingKey)).resolves.toBeUndefined();
  } finally { edge.restore(); vi.useRealTimers(); }
} },
    { name: 'the single-destination chat door stores a credential only after a fresh email confirmation', run: async () => {
  const { workspaceId } = await seedWorkspace();
  const owner = (await seedMember(workspaceId, { role: 'owner', email: 'owner\x40chat.test', displayName: 'Alex Owner' })).memberId;
  await seedMember(workspaceId, { role: 'member', email: 'reader\x40chat.test', displayName: 'Morgan Reader' });
  const token = 'synthetic-slate-201', origin = 'https://slate.test';
  const bindings: AppBindings = { ...env, SLATE_PROFILE: undefined, CONNECTOR_CREDENTIALS_KEY: crypto.randomUUID(), APP_URL: origin };
  const app = createApi(), edge = slackNetwork('reader\x40chat.test', token), mail = captureMail();
  const connect = async (cookie: string) => app.request(origin + '/api/notifications/chat', { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify({ operationKey: crypto.randomUUID(), channel: 'GCHAT', token, events: ['comment'] }) }, bindings);
  try {
    const unconfirmed = await connect(await sessionFor(owner));
    expect(unconfirmed.status).toBe(403);
    expect(await unconfirmed.json()).toMatchObject({ code: 'STEP_UP_REQUIRED' });
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM chat_connections').first<number>('count')).toBe(0);
    expect(edge.attempts).toEqual([]);
    const confirmed = await connect(await sessionFor(owner, { freshProof: true }));
    expect(confirmed.status, await confirmed.clone().text()).toBe(200);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM chat_connections').first<number>('count')).toBe(1);
  } finally { mail.restore(); edge.restore(); }
} },
    { name: 'a person whose own Slack token posts to a channel stays in that channel audience', run: async () => {
  const { workspaceId } = await seedWorkspace();
  const owner = (await seedMember(workspaceId, { role: 'owner', email: 'owner\x40chat.test', displayName: 'Alex Owner' })).memberId;
  const reader = (await seedMember(workspaceId, { role: 'member', email: 'reader\x40chat.test', displayName: 'Morgan Reader' })).memberId;
  const shared = (await seedContainer(workspaceId, { ownerMemberId: owner, visibility: 'private' })).containerId;
  const readerOnly = (await seedContainer(workspaceId, { ownerMemberId: reader, visibility: 'private' })).containerId;
  for (const [containerId, principalId] of [[shared, owner], [shared, reader], [readerOnly, reader]] as const) await seedContainerGrant(containerId, { principalKind: 'member', principalId, level: 'full' });
  const cookies = { owner: await sessionFor(owner, { freshProof: true }), reader: await sessionFor(reader) };
  const token = 'synthetic-slate-202', origin = 'https://slate.test', key = () => crypto.randomUUID();
  const bindings: AppBindings = { ...env, SLATE_PROFILE: undefined, CONNECTOR_CREDENTIALS_KEY: crypto.randomUUID(), APP_URL: origin };
  const app = createApi(), edge = slackNetwork('reader\x40chat.test', token);
  const raw = (method: string, path: string, body?: unknown, actor: keyof typeof cookies = 'owner') => app.request(origin + path, { method, headers: { cookie: cookies[actor], origin, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) }, bindings);
  const api = async (method: string, path: string, body?: unknown, actor: keyof typeof cookies = 'owner') => { const response = await raw(method, path, body, actor), text = await response.text(); expect(response.status, text).toBe(200); return JSON.parse(text); };
  const drain = async () => {
    await env.DB.prepare("UPDATE chat_deliveries SET created_at=? WHERE state='pending' AND message_id IS NULL").bind(new Date(Date.now() - 120000).toISOString()).run();
    await env.DB.prepare("UPDATE notification_outbox SET created_at=? WHERE processed_at IS NULL").bind(new Date(Date.now() - 120000).toISOString()).run();
    const ack = vi.fn(), retry = vi.fn();
    await worker.queue!({ queue: 'test-discovery', metadata: { metrics: { backlogCount: 1, backlogBytes: 0 } }, messages: [{ id: key(), body: { type: 'discovery.deliver' }, timestamp: new Date(), attempts: 1, ack, retry }], ackAll: vi.fn(), retryAll: vi.fn() } as MessageBatch<unknown>, bindings);
    expect(retry).not.toHaveBeenCalled();
  };
  try {
    // The connecting credential is the owner's own Slack identity, not a bot.
    edge.setAudience({ users: { BOT: { profile: { email: 'owner\x40chat.test' } }, READER: { profile: { email: 'reader\x40chat.test' } } } });
    await api('POST', '/api/notifications/chat', { operationKey: key(), channel: 'GCHAT', token, events: ['comment'] });
    const visible = (await api('POST', '/api/pages', { operationKey: key(), containerId: shared, title: 'Shared incident review' }, 'reader')).value.pageId;
    const hidden = (await api('POST', '/api/pages', { operationKey: key(), containerId: readerOnly, title: 'Reader-only acquisition plan' }, 'reader')).value.pageId;
    expect((await raw('GET', `/api/pages/${hidden}`)).status).toBe(404);
    for (const pageId of [hidden, visible]) await api('POST', `/api/comments/page/${pageId}`, { operationKey: key(), body: [{ text: 'synthetic-slate-comment' }] }, 'reader');
    await drain(); await drain();
    expect(edge.messages.map(message => message.text).join('\n')).toContain('Shared incident review');
    expect(JSON.stringify(edge.messages)).not.toContain('Reader-only acquisition plan');
  } finally { edge.restore(); }
} }
  ];
  for (const scenario of cases) {
    try { await (resetDeployment)(); await scenario.run(); }
    catch (cause) { throw new Error(`Case ${scenario.name} failed`, { cause }); }
    finally {  }
  }
});
