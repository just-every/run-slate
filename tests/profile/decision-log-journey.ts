import {env} from 'cloudflare:test';
import {expect} from 'vitest';
import type {createApi} from '../../src/core/app/hono';
import {seedMember, sessionFor} from '../e2e/setup/fixtures';
import {decisionLogCorpus, assertDecisionMembership, type DecisionRequest} from '../helpers/decision-log-corpus';

/** The default profile uses native routes, never flagship services or decision rows. */
export async function decisionLogJourney(api: ReturnType<typeof createApi>, workspaceId: string, ownerId: string, cookie: string) {
  const reader = await seedMember(workspaceId, {role: 'member', displayName: 'Decision reader', email: ['synthetic-slate-4', 'test.invalid'].join('@')});
  const readerCookie = await sessionFor(reader.memberId);
  const request: DecisionRequest = async (actor, method, path, body) => {
    const response = await api.request('https://slate.example' + path, {method, headers: {cookie: actor === 'owner' ? cookie : readerCookie, ...(body ? {'content-type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})}, env);
    expect(response.status, await response.clone().text()).toBe(200);
    return response.json();
  };
  expect(await request('reader', 'GET', '/api/profile')).toEqual({profile: 'core-wiki'});
  const corpus = await decisionLogCorpus(request, ownerId, reader.memberId);
  const {rows, cases} = corpus;
  for (const scenario of cases) {
    const query = new URLSearchParams(scenario.filter as Record<string, string>);
    const result = await request('reader', 'GET', '/api/decisions?' + query);
    assertDecisionMembership(result.items, rows, scenario.keys, scenario.name);
  }
  assertDecisionMembership((await request('owner', 'GET', '/api/decisions')).items, rows, [...cases[0].keys, 'private'], 'Owner can read the restricted record');
  for (const key of cases[0].keys) {
    const row = rows[key], exact = row.acceptedRevisionId;
    const selected = await request('reader', 'GET', `/api/decisions/${row.id}${exact ? '?revision=' + exact : ''}`);
    expect(selected.viewedRevisionId).toBe(exact ?? row.revision_id);
    expect(selected.content).toEqual(row.content);
  }
  const forbidden = await api.request('https://slate.example/api/decisions/' + rows.private.id, {headers: {cookie: readerCookie}}, env);
  expect(forbidden.status).toBe(404);
  expect(await forbidden.json()).toMatchObject({code: 'NOT_FOUND'});
  // An already captured read cannot bypass a current revocation of the host page.
  const revoked = rows.reviewed;
  await request('owner', 'POST', '/api/sharing', {operationKey: crypto.randomUUID(), targetKind: 'page', targetId: revoked.page_id, principalKind: 'member', principalId: ownerId, level: 'full'});
  await request('owner', 'PUT', `/api/sharing/pages/${revoked.page_id}/inheritance`, {operationKey: crypto.randomUUID(), expectedRevisionId: (await request('owner', 'GET', '/api/pages/' + revoked.page_id)).page.revisionId, restricted: true});
  assertDecisionMembership((await request('reader', 'GET', '/api/decisions')).items, rows, ['old', 'replacement', 'changed', 'draft', 'later'], 'Current access excludes a previously readable decision');
  const replay = await api.request(`https://slate.example/api/decisions/${revoked.id}?revision=${revoked.acceptedRevisionId}`, {headers: {cookie: readerCookie}}, env);
  expect(replay.status).toBe(404);
}
