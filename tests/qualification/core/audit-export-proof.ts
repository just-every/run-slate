import { expect, vi } from 'vitest';
import type { auditFixture } from './audit-support';
import { env, createUlid } from './audit-support';
import { createOpaqueToken } from '../../../src/core/platform/auth/token';
import { scheduleWebhooks } from '../../../src/core/features/webhooks/worker';
import { pruneAudit } from '../../../src/core/features/activity/audit-settings';
import { captureMail } from '../../e2e/helpers/mail-edge';

export async function auditExportProof(f: Awaited<ReturnType<typeof auditFixture>>) {
  const origin = new URL(String(env.APP_URL)).origin, bindings = { ...env, CONNECTOR_CREDENTIALS_KEY: createOpaqueToken() };
  const request = (path: string, method = 'GET', body?: unknown, actor = f.ownerId) => f.api.request(origin + path, { method, headers: { cookie: f.cookies[actor]!, origin, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, bindings);
  const json = async (path: string, method = 'GET', body?: unknown, actor = f.ownerId) => { const response = await request(path, method, body, actor); expect(response.status).toBe(200); return response.json<any>(); };
  const receiver: { body: string; headers: Headers }[] = []; let outage = false;
  const priorFetch = globalThis.fetch;
  const edge = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'cloudflare-dns.com') return Response.json({ Answer: url.searchParams.get('type') === 'A' ? [{ type: 1, data: '8.8.8.8' }] : [] });
    if (url.hostname !== 'synthetic-slate-1.example.com') return priorFetch(input, init);
    receiver.push({ body: String(init?.body), headers: new Headers(init?.headers) });
    return new Response('synthetic-slate-audit', { status: outage ? 503 : 200 });
  });
  const mail = captureMail();
  try {
    const email = await env.DB.prepare('SELECT email FROM members WHERE id=?').bind(f.ownerId).first<string>('email');
    expect((await request('/api/auth/magic', 'POST', { email, requestKey: createOpaqueToken() })).status).toBe(200);
    const link = mail.latestLink(email!.toLowerCase()), token = link.searchParams.get('token')!;
    const signedIn = await f.api.request(origin + '/auth/confirm', { method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) }, bindings);
    expect(signedIn.status).toBe(303);
    await json('/api/sharing', 'POST', { operationKey: createUlid(), targetKind: 'container', targetId: f.containerId, principalKind: 'member', principalId: f.readerId, level: 'view' });
    const minted = await json('/api/developer/tokens', 'POST', { operationKey: createUlid(), name: 'synthetic-slate-audit-token', scopes: [{ containerId: f.containerId, level: 'read' }] });
    expect((await f.api.request(origin + `/api/v1/pages?containerId=${f.containerId}`, { headers: { authorization: `Bearer ${minted.secret}` } }, bindings)).status).toBe(200);
    await json(`/api/developer/tokens/${minted.value.id}/revoke`, 'POST', { operationKey: createUlid() });
    await f.profile({ 'page.lifecycle.v1': 'draft-then-publish' });
    expect((await request('/api/activity/settings', 'PUT', { operationKey: createUlid(), retentionDays: 2 })).status).toBe(400);
    await json('/api/activity/settings', 'PUT', { operationKey: createUlid(), retentionDays: 400 });
    expect((await json('/api/activity/settings')).retentionDays).toBe(400);
    for (const path of ['/api/activity/settings', '/api/activity/export', '/api/activity/streams']) expect((await request(path, path.endsWith('settings') ? 'GET' : 'POST', path.endsWith('settings') ? undefined : {}, f.readerId)).status).toBe(403);
    const now = Date.now(), input = { operationKey: createUlid(), format: 'json', from: new Date(now - 86400000).toISOString(), to: new Date(now + 86400000).toISOString() };
    const rows = await json('/api/activity/export', 'POST', input);
    for (const action of ['auth.sign-in', 'sharing.grant', 'api-token.grant', 'api-token.use', 'api-token.revoke', 'workspace.update', 'audit.retention', 'audit.export']) {
      const found = rows.find((row: any) => row.action === action); expect(found, action).toBeTruthy(); expect(found.actor.id).toBe(f.ownerId); expect(Number.isFinite(Date.parse(found.occurredAt))).toBe(true); expect(found.target.id.length).toBeGreaterThan(0);
    }
    expect(JSON.stringify(rows).includes(minted.secret)).toBe(false); expect(rows.every((row: any) => !('detail' in row) && !('body' in row))).toBe(true);
    const filtered = await json('/api/activity/export', 'POST', { ...input, operationKey: createUlid(), actorId: f.ownerId, action: 'sharing.grant', targetId: f.containerId });
    expect(filtered.length).toBeGreaterThan(0); expect(filtered.every((row: any) => row.actor.id === f.ownerId && row.action === 'sharing.grant' && row.target.id === f.containerId)).toBe(true);
    await env.DB.prepare('UPDATE members SET display_name=? WHERE id=?').bind('=synthetic-slate-formula', f.ownerId).run();
    const csv = await (await request('/api/activity/export', 'POST', { ...input, operationKey: createUlid(), format: 'csv' })).text();
    expect(csv.includes('"\'=synthetic-slate-formula"')).toBe(true); expect(csv.includes('auth.sign-in')).toBe(true); expect(csv.includes(minted.secret)).toBe(false);
    expect((await request('/api/activity/export', 'POST', { ...input, operationKey: createUlid(), from: '2000-01-01T00:00:00.000Z' })).status).toBe(400);
    const stream = await json('/api/activity/streams', 'POST', { operationKey: createUlid(), name: 'synthetic-slate-audit-stream', destination: 'https://synthetic-slate-1.example.com/audit' });
    const start = await env.DB.prepare('SELECT scan_sequence FROM webhook_subscriptions WHERE id=?').bind(stream.value.id).first<number>('scan_sequence');
    await f.page('synthetic-slate-stream-before'); await scheduleWebhooks(bindings);
    outage = true; await f.page('synthetic-slate-stream-outage-one'); await f.page('synthetic-slate-stream-outage-two'); await scheduleWebhooks(bindings);
    const failedEvent = receiver.at(-1)!.headers.get('slate-event-id'); const sentCount = receiver.length;
    await scheduleWebhooks(bindings); expect(receiver.length).toBe(sentCount);
    outage = false; await scheduleWebhooks(bindings, new Date(Date.now() + 61000).toISOString());
    const ids = receiver.map(item => item.headers.get('slate-event-id'));
    expect(ids.filter(id => id === failedEvent).length).toBe(2);
    const expected = await env.DB.prepare('SELECT event_id FROM webhook_events WHERE workspace_id=? AND sequence>? ORDER BY sequence').bind(f.workspaceId, start).all<{ event_id: string }>();
    expect([...new Set(ids)]).toEqual(expected.results.map(row => row.event_id));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(stream.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    for (const item of receiver) {
      const [timestamp, signature] = item.headers.get('slate-signature')!.split(',');
      const signatureBytes = Uint8Array.from(signature!.slice(3).match(/../g)!, hex => parseInt(hex, 16));
      expect(await crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(`${timestamp!.slice(2)}.${item.body}`))).toBe(true);
      expect(JSON.parse(item.body).type).toBe('audit'); expect(item.body.includes(minted.secret)).toBe(false);
    }
    const oldId = createUlid(), retainedId = createUlid();
    for (const [id, age] of [[oldId, 401], [retainedId, 399]] as const) await env.DB.prepare("INSERT INTO activity_entries(id,workspace_id,actor_member_id,feature,action,target_kind,target_id,detail_json,occurred_at) VALUES(?,?,?,'audit','audit.retention','workspace',?,'{}',?)").bind(id, f.workspaceId, f.ownerId, f.workspaceId, new Date(Date.now() - age * 86400000).toISOString()).run();
    await pruneAudit(bindings);
    expect(await env.DB.prepare('SELECT id FROM activity_entries WHERE id=?').bind(oldId).first()).toBeNull(); expect(await env.DB.prepare('SELECT id FROM activity_entries WHERE id=?').bind(retainedId).first()).not.toBeNull();
  } finally { mail.restore(); edge.mockRestore(); }
}
