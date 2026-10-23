import {env} from 'cloudflare:test';
import {expect, vi} from 'vitest';
import type {createApi} from '../../src/core/app/hono';
import type {AppBindings} from '../../src/core/app/types';
import type {SwitchState} from '../../src/core/features/feature-switches/catalog';
import {seedMember, sessionFor} from '../e2e/setup/fixtures';

/** The safety-held switches are not a second route around their pending acceptance. */
export async function featureSwitchJourney(api: ReturnType<typeof createApi>, f: {workspaceId: string; memberId: string; cookie: string; containerId: string}) {
  const ownerCookie = await sessionFor(f.memberId, {freshProof: true});
  const member = await seedMember(f.workspaceId, {role: 'member', displayName: 'synthetic-slate-2', email: crypto.randomUUID() + '@test.invalid'});
  const memberCookie = await sessionFor(member.memberId);
  const configured = {...env, SLATE_PROFILE: undefined, AI_API_KEY: crypto.randomUUID(), AI_MODEL: 'synthetic-slate-1'};
  const request = (path: string, method = 'GET', body?: unknown, cookie = ownerCookie, bindings: AppBindings = env) => api.request(env.APP_URL! + path, {method, headers: {cookie, ...(body === undefined ? {} : {'content-type': 'application/json'})}, body: body === undefined ? undefined : JSON.stringify(body)}, bindings);
  const settings = async (bindings: AppBindings = env) => {
    const response = await request('/api/workspace/features', 'GET', undefined, ownerCookie, bindings);
    expect(response.status).toBe(200);
    return (await response.json<{items: SwitchState[]}>()).items;
  };
  const change = (key: string, enabled: boolean, bindings: AppBindings = env, operationKey = crypto.randomUUID()) => request('/api/workspace/features', 'PUT', {operationKey, key, enabled}, ownerCookie, bindings);
  const initial = await settings();
  expect(initial.every(state => !state.enabled && !state.effective && state.changedAt === null && state.changedBy === null)).toBe(true);
  expect(initial.find(state => state.key === 'mcp')?.available).toBe(true);
  for (const key of ['ai', 'ask', 'suggestions', 'agents', 'connectors', 'chat-ask']) {
    expect(initial.find(state => state.key === key)?.available).toBe(false);
    expect((await change(key, true)).status).toBe(403);
  }
  for (const method of ['GET', 'PUT']) {
    expect((await request('/api/workspace/features', method, method === 'PUT' ? {operationKey: crypto.randomUUID(), key: 'mcp', enabled: true} : undefined, memberCookie)).status).toBe(403);
    expect((await request('/api/workspace/features', method, method === 'PUT' ? {operationKey: crypto.randomUUID(), key: 'mcp', enabled: true} : undefined, '')).status).toBe(401);
  }
  expect((await request('/api/workspace/features', 'PUT', {operationKey: crypto.randomUUID(), key: 'unknown', enabled: true})).status).toBe(400);
  expect((await request('/api/workspace/features', 'PUT', {operationKey: crypto.randomUUID(), key: 'mcp', enabled: 'false'})).status).toBe(400);

  const enableKey = crypto.randomUUID();
  expect((await change('mcp', true, env, enableKey)).status).toBe(200);
  expect((await change('mcp', true, env, enableKey)).status).toBe(200);
  expect((await request('/api/agent/tools')).status).toBe(200);
  const opened = (await settings()).find(state => state.key === 'mcp')!;
  expect(opened).toMatchObject({enabled: true, effective: true, changedBy: {id: f.memberId}, changedAt: new Date().toISOString()});
  const init = await request('/api/agent/mcp', 'POST', {jsonrpc: '2.0', id: 1, method: 'initialize'});
  expect(init.status).toBe(200);
  expect(await init.json()).toHaveProperty('result.capabilities.tools');
  const minted = await request('/api/agent/credentials', 'POST', {operationKey: crypto.randomUUID(), subjectId: f.memberId, scope: {tools: ['ask'], sourceIds: [f.containerId], audience: [f.memberId], grantIds: []}, expiresAt: new Date(Date.now() + 86400000).toISOString()});
  expect(minted.status, minted.ok ? '' : JSON.stringify(await minted.json())).toBe(200);
  const credentials = (await env.DB.prepare('SELECT * FROM intelligence_agent_credentials').all()).results;
  expect(credentials.length).toBeGreaterThan(0);
  // A live transport does not enable an answer or production-effect tool.
  expect((await request('/api/agent/tools/ask', 'POST', {})).status).toBe(403);
  const effect = await request('/api/agent/mcp', 'POST', {jsonrpc: '2.0', id: 2, method: 'tools/call', params: {name: 'dispatch_effect', arguments: {id: 'synthetic-slate-3'}}});
  expect(await effect.json()).toMatchObject({result: {isError: true, content: [{type: 'text', text: expect.stringContaining('FEATURE_DISABLED')}]}});
  expect((await change('mcp', false)).status).toBe(200);
  expect((await request('/api/agent/tools')).status).toBe(403);
  expect((await env.DB.prepare('SELECT * FROM intelligence_agent_credentials').all()).results).toEqual(credentials);
  const changes = await env.DB.prepare("SELECT actor_member_id,occurred_at,detail_json FROM activity_entries WHERE action='workspace.feature-switch' AND operation_key=?").bind(enableKey).all<{actor_member_id: string; occurred_at: string; detail_json: string}>();
  expect(changes.results).toEqual([{actor_member_id: f.memberId, occurred_at: opened.changedAt, detail_json: JSON.stringify({switchKey: 'mcp', enabled: true})}]);
  expect((await request('/api/activity?action=workspace.feature-switch')).status).toBe(200);

  const attempts: string[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {attempts.push(String(input)); throw new Error('Unexpected provider edge request');});
  try {
    expect((await change('ai', true, configured)).status).toBe(200);
    expect(await env.DB.prepare('SELECT ai_enabled FROM workspaces WHERE id=?').bind(f.workspaceId).first<number>('ai_enabled')).toBe(1);
    const ask = (await settings(configured)).find(state => state.key === 'ask')!;
    expect(ask.available).toBe(false);
    expect(ask.prerequisites).not.toEqual([]);
    expect((await change('ask', true, configured)).status).toBe(403);
    // Even a stored choice from a later archive cannot override a release safety hold.
    for (const key of ['ask', 'suggestions', 'agents', 'connectors']) await env.DB.prepare('INSERT INTO workspace_feature_switches VALUES (?,?,1,?,?)').bind(f.workspaceId, key, f.memberId, new Date().toISOString()).run();
    for (const family of ['ai/ask', 'runs', 'suggestions', 'skills', 'claims', 'impact', 'connectors', 'sources']) {
      const response = await request('/api/' + family, 'POST', {}, ownerCookie, configured);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({code: 'FEATURE_DISABLED'});
    }
    expect((await settings(configured)).filter(state => state.key !== 'ai' && state.key !== 'mcp').every(state => !state.effective)).toBe(true);
    expect((await change('ai', false, configured)).status).toBe(200);
    expect(await env.DB.prepare('SELECT ai_enabled FROM workspaces WHERE id=?').bind(f.workspaceId).first<number>('ai_enabled')).toBe(0);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM intelligence_runs').first<number>('n')).toBe(0);
    expect(attempts).toEqual([]);
  } finally {vi.unstubAllGlobals();}
}
