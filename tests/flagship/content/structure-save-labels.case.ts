import {env} from 'cloudflare:test';
import {expect, test} from 'vitest';
import {createApi} from '../../../src/core/app/hono';
import {seedContainer, seedContainerGrant, seedMember, seedWorkspace, sessionFor} from '../../e2e/setup/fixtures';

/**
 * Mention labels follow each reader's access. Bob may not open the mentioned page and
 * Carol may. Bob saves another block of the page; Carol, whose editor still holds the
 * mention block's earlier revision and changed nothing in it, then saves her own change.
 * Her save is never refused as a BLOCK_CONFLICT because of a label.
 */
export async function structureSaveLabelsCase() {
  const api = createApi(), origin = 'https://slate.test';
  const {workspaceId} = await seedWorkspace();
  const {memberId: alice} = await seedMember(workspaceId, {role: 'owner', email: `alice-${workspaceId}@example.test`, displayName: 'Alice Owner'});
  const {memberId: bob} = await seedMember(workspaceId, {role: 'member', email: `bob-${workspaceId}@example.test`, displayName: 'Bob Editor'});
  const {memberId: carol} = await seedMember(workspaceId, {role: 'member', email: `carol-${workspaceId}@example.test`, displayName: 'Carol Editor'});
  const [aliceCookie, bobCookie, carolCookie] = await Promise.all([alice, bob, carol].map(member => sessionFor(member)));
  const call = async (cookie: string, method: string, path: string, body?: unknown) => {
    const response = await api.request(origin + path, {method, headers: {cookie, ...(body ? {'content-type': 'application/json', origin} : {})}, ...(body ? {body: JSON.stringify(body)} : {})}, env);
    return {status: response.status, json: await response.json() as any};
  };
  const ok = async (cookie: string, method: string, path: string, body?: unknown) => {
    const result = await call(cookie, method, path, body);
    expect(result.status, `${method} ${path}: ${JSON.stringify(result.json).slice(0, 300)}`).toBeLessThan(300);
    return result.json;
  };
  const key = () => crypto.randomUUID();

  const {containerId: shared} = await seedContainer(workspaceId, {ownerMemberId: alice, visibility: 'closed'});
  for (const [member, level] of [[alice, 'full'], [bob, 'edit'], [carol, 'edit']] as const) await seedContainerGrant(shared, {principalKind: 'member', principalId: member, level});
  const {containerId: closed} = await seedContainer(workspaceId, {ownerMemberId: alice, visibility: 'closed'});
  await seedContainerGrant(closed, {principalKind: 'member', principalId: alice, level: 'full'});

  const title = `Supplier contacts ${key().slice(0, 8)}`;
  const supplier = (await ok(aliceCookie, 'POST', '/api/pages', {operationKey: key(), containerId: closed, title})).value.pageId as string;
  await ok(aliceCookie, 'POST', '/api/sharing', {operationKey: key(), targetKind: 'page', targetId: supplier, principalKind: 'member', principalId: carol, level: 'view'});
  const [mentionId, notesId] = [key(), key()];
  const mention = {text: [{text: 'Call '}, {text: title, mention: {kind: 'page', id: supplier, label: title}}]};
  const index = (await ok(aliceCookie, 'POST', '/api/pages', {operationKey: key(), containerId: shared, title: 'Index', blocks: [
    {id: mentionId, blockType: 'paragraph', content: mention, treePosition: 'a0'},
    {id: notesId, blockType: 'paragraph', content: {text: [{text: 'Notes'}]}, treePosition: 'a1'},
  ]})).value.pageId as string;

  const load = async (cookie: string) => {
    const document = await ok(cookie, 'GET', `/api/pages/${index}`);
    return {revisionId: document.workingRevisionId as string, blocks: document.blocks as {id: string; blockType: string; content: unknown; treePosition: string; revisionId: string}[]};
  };
  const save = (cookie: string, from: Awaited<ReturnType<typeof load>>, edits: Record<string, unknown>, revisions: Record<string, string>) => call(cookie, 'PUT', `/api/pages/${index}/blocks`, {
    operationKey: key(), expectedRevisionId: from.revisionId,
    blocks: from.blocks.map(b => ({id: b.id, blockType: b.blockType, content: edits[b.id] ?? b.content, treePosition: b.treePosition})),
    blockRevisions: revisions,
  });
  const text = (value: string) => ({text: [{text: value}]});

  const carolLoaded = await load(carolCookie);
  const bobLoaded = await load(bobCookie);
  expect(JSON.stringify(carolLoaded.blocks[0]!.content)).toContain(title);
  expect(JSON.stringify(bobLoaded.blocks[0]!.content)).not.toContain(title);

  // Bob changes only the notes block; his copy of the mention block carries his label.
  const bobSaved = await save(bobCookie, bobLoaded, {[notesId]: text('Notes, edited by Bob')}, Object.fromEntries(bobLoaded.blocks.map(b => [b.id, b.revisionId])));
  expect(bobSaved.status, JSON.stringify(bobSaved.json)).toBe(200);

  // Carol's editor took Bob's notes block live but still holds the mention block's earlier revision.
  const carolNow = await load(carolCookie);
  const carolEdit = await save(carolCookie, carolNow, {[notesId]: text('Notes, edited by Bob and Carol')}, {[mentionId]: carolLoaded.blocks[0]!.revisionId, [notesId]: carolNow.blocks[1]!.revisionId});
  expect(carolEdit.status, JSON.stringify(carolEdit.json)).toBe(200);

  // The stored mention still carries its own title, whoever saved last.
  const after = await load(carolCookie);
  expect(JSON.stringify(after.blocks[0]!.content)).toContain(title);
  expect(JSON.stringify((await load(bobCookie)).blocks[0]!.content)).not.toContain(title);
}
