import {env} from 'cloudflare:test';
import {expect, vi} from 'vitest';
import type {createApi} from '../../src/core/app/hono';
import {seedMember, seedContainerGrant, sessionFor} from '../e2e/setup/fixtures';

/** Real default-profile saves reconcile receipts with durable decision rows. */
export async function decisionEditJourney(api: ReturnType<typeof createApi>, containerId: string, workspaceId: string, ownerId: string, ownerCookie: string) {
  const editor = await seedMember(workspaceId, {role: 'member', displayName: 'Proposal editor', email: ['synthetic-slate-6', 'test.invalid'].join('@')});
  await seedContainerGrant(containerId, {principalKind: 'member', principalId: editor.memberId, level: 'edit'});
  const editorCookie = await sessionFor(editor.memberId);
  const request = (route: string, method = 'GET', body?: unknown, cookie = editorCookie) => api.request('https://slate.example' + route, {
    method, headers: {cookie, ...(body ? {'content-type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {}),
  }, env);
  const read = async (route: string) => {
    const response = await request(route);
    expect(response.status, await response.clone().text()).toBe(200);
    return response.json<any>();
  };
  const command = async (route: string, body: Record<string, unknown>, cookie = editorCookie) => {
    const response = await request(route, 'POST', {operationKey: crypto.randomUUID(), ...body}, cookie);
    expect(response.status, await response.clone().text()).toBe(200);
    return response.json<any>();
  };
  expect(await read('/api/profile')).toEqual({profile: 'core-wiki'});
  const host = await command('/api/pages', {containerId, title: 'Proposal editing host'}, ownerCookie);
  const source = await command('/api/pages', {containerId, title: 'Proposal evidence'}, ownerCookie);
  const pageId = host.value.pageId;
  const sourceDocument = await read('/api/pages/' + source.value.pageId);
  const original = {pageId, question: 'Which procedure?', options: ['First', 'Second'], outcome: 'First', rationale: 'Original reasoning', ownerId, decidedAt: null, reviewAt: null, citations: []};
  const created = await command('/api/decisions', original, ownerCookie);
  const id = created.value.id, route = '/api/decisions/' + id;
  const raw = async () => ({
    row: await env.DB.prepare('SELECT * FROM knowledge_decisions WHERE id=?').bind(id).first(),
    revisions: (await env.DB.prepare('SELECT * FROM intelligence_revisions WHERE entity_id=? ORDER BY created_at,id').bind(id).all()).results,
    activity: (await env.DB.prepare("SELECT * FROM activity_entries WHERE target_id=? AND target_kind='decision' ORDER BY occurred_at,id").bind(id).all()).results,
  });
  const initial = await read(route);
  expect(initial.permissions.canEdit).toBe(true);
  const snapshots = [{id: created.receipt.revisionId, content: initial.content, actor: ownerId, time: created.receipt.committedAt}];
  const changes: [string, unknown][] = [
    ['question', 'Which revised procedure?'], ['options', ['Second', 'Third']], ['outcome', 'Third'],
    ['rationale', 'Revised reasoning'], ['ownerId', editor.memberId], ['decidedAt', '2026-10-18T00:00:00.000Z'],
    ['reviewAt', '2099-02-01T00:00:00.000Z'], ['citations', [{kind: 'page', sourceId: source.value.pageId, revisionId: sourceDocument.workingRevisionId}]],
    ['ownerId', ownerId],
  ];
  let draft: Record<string, unknown> = {...original, id}, current = created.receipt.revisionId;
  for (const [index, [field, value]] of changes.entries()) {
    vi.setSystemTime(new Date(Date.parse('2026-10-18T12:00:00.000Z') + (index + 1) * 1000));
    const before = await raw();
    const submitted = {...draft, [field]: value, expectedRevisionId: current, operationKey: crypto.randomUUID()};
    const saved = await command('/api/decisions', submitted);
    const {receipt} = saved;
    expect(receipt.unchanged).toBeUndefined();
    expect(receipt.entity).toEqual({kind: 'decision', id, revisionId: saved.value.revisionId});
    expect(receipt.operationKey).toBe(submitted.operationKey);
    expect(receipt.revisionId).not.toBe(current);
    const after = await raw();
    expect(after.revisions).toHaveLength(before.revisions.length + 1);
    expect(after.activity).toHaveLength(before.activity.length + 1);
    const revision = after.revisions.find(row => row.id === receipt.revisionId)!;
    expect(revision).toMatchObject({entity_kind: 'decision', actor_id: editor.memberId, created_at: receipt.committedAt});
    expect(JSON.parse(revision.content_json as string)).toEqual(submitted);
    expect(after.activity.find(row => row.id === receipt.activityId)).toMatchObject({actor_member_id: editor.memberId, occurred_at: receipt.committedAt, operation_key: submitted.operationKey, action: 'decisions.save'});
    const reloaded = await read(route);
    expect(reloaded.content[field]).toEqual(value);
    expect(reloaded.revision_id).toBe(receipt.revisionId);
    expect(after.row).toMatchObject({question: reloaded.content.question, options_json: JSON.stringify(reloaded.content.options), outcome: reloaded.content.outcome, rationale: reloaded.content.rationale, owner_member_id: reloaded.content.ownerId, decided_at: reloaded.content.decidedAt, review_at: reloaded.content.reviewAt, revision_id: receipt.revisionId});
    snapshots.push({id: receipt.revisionId, content: submitted, actor: editor.memberId, time: receipt.committedAt});
    draft = submitted;
    current = receipt.revisionId;
  }
  const beforeNoop = await raw();
  const unchanged = await command('/api/decisions', {...draft, expectedRevisionId: current, operationKey: crypto.randomUUID()});
  expect(unchanged.receipt).toMatchObject({unchanged: true, activityId: null, revisionId: current});
  expect(await raw()).toEqual(beforeNoop);
  const ordered = [...snapshots].reverse();
  expect((await read(route + '/history')).items.map((row: any) => row.id)).toEqual(ordered.map(row => row.id));
  for (const snapshot of snapshots) {
    const selected = await read(route + '?revision=' + snapshot.id);
    expect(selected.content).toEqual(snapshot.content);
    expect(selected.revision).toMatchObject({actorId: snapshot.actor, createdAt: snapshot.time});
    expect(selected.owner_member_id).toBe(snapshot.content.ownerId);
    expect(selected.decided_at).toBe(snapshot.content.decidedAt);
    expect(selected.review_at).toBe(snapshot.content.reviewAt);
  }
  const stale = await request('/api/decisions', 'POST', {...draft, expectedRevisionId: created.receipt.revisionId, operationKey: crypto.randomUUID(), outcome: 'Stale overwrite'});
  expect(stale.status).toBe(409);
  expect(await stale.json()).toMatchObject({code: 'REVISION_CONFLICT'});
  expect(await raw()).toEqual(beforeNoop);
  // A restricted host ensures a direct view grant cannot inherit container edit.
  await command('/api/sharing', {targetKind: 'page', targetId: pageId, principalKind: 'member', principalId: ownerId, level: 'full'}, ownerCookie);
  await command('/api/sharing', {targetKind: 'page', targetId: pageId, principalKind: 'member', principalId: editor.memberId, level: 'view'}, ownerCookie);
  const restricted = await request(`/api/sharing/pages/${pageId}/inheritance`, 'PUT', {operationKey: crypto.randomUUID(), expectedRevisionId: (await read('/api/pages/' + pageId)).page.revisionId, restricted: true}, ownerCookie);
  expect(restricted.status).toBe(200);
  expect((await read(route)).permissions.canEdit).toBe(false);
  const viewOnlyBefore = await raw();
  for (const operationKey of [crypto.randomUUID(), draft.operationKey]) {
    const refused = await request('/api/decisions', 'POST', {...draft, expectedRevisionId: current, operationKey, question: 'Forbidden overwrite'});
    expect(refused.status).toBe(404);
    expect(await refused.json()).toMatchObject({code: 'NOT_FOUND'});
    expect(await raw()).toEqual(viewOnlyBefore);
  }
  await command('/api/sharing', {targetKind: 'page', targetId: pageId, principalKind: 'member', principalId: editor.memberId, level: 'edit'}, ownerCookie);
  const notOwner = await request(route + '/accept', 'POST', {operationKey: crypto.randomUUID(), expectedRevisionId: current});
  expect(notOwner.status).toBe(403);
  expect(await notOwner.json()).toMatchObject({code: 'DECISION_OWNER_REQUIRED'});
  expect(await raw()).toEqual(viewOnlyBefore);
  const accepted = await command(route + '/accept', {expectedRevisionId: current}, ownerCookie);
  const acceptedBefore = await raw();
  expect((await read(route)).state).toBe('accepted');
  expect(acceptedBefore.revisions).toHaveLength(beforeNoop.revisions.length + 1);
  expect(acceptedBefore.revisions.find(row => row.id === accepted.receipt.revisionId)).toMatchObject({entity_kind: 'decision-acceptance', actor_id: ownerId, created_at: accepted.receipt.committedAt});
  const forbiddenChanges = {question: 'Cannot revise acceptance', options: ['Forbidden option'], outcome: 'First', rationale: 'Forbidden reasoning', ownerId: editor.memberId, decidedAt: '2026-10-19T00:00:00.000Z', reviewAt: '2099-03-01T00:00:00.000Z', citations: []};
  for (const [field, value] of Object.entries(forbiddenChanges)) {
    const refused = await request('/api/decisions', 'POST', {...draft, [field]: value, operationKey: crypto.randomUUID(), expectedRevisionId: accepted.receipt.revisionId});
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({code: 'IMMUTABLE_DECISION'});
    expect(await raw()).toEqual(acceptedBefore);
  }
  // Acceptance cannot replace any earlier proposal snapshot.
  for (const snapshot of snapshots) expect((await read(route + '?revision=' + snapshot.id)).content).toEqual(snapshot.content);
}
