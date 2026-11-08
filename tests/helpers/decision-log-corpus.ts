import assert from 'node:assert/strict';

export type DecisionActor = 'owner' | 'reader';
export type DecisionRequest = (actor: DecisionActor, method: string, path: string, body?: Record<string, unknown>) => Promise<any>;

/** Native receipts create the corpus; expected memberships below are written independently. */
export async function decisionLogCorpus(request: DecisionRequest, ownerId: string, readerId: string) {
  const receipts: {actor: DecisionActor; path: string; response: any}[] = [];
  const command = async (actor: DecisionActor, method: string, path: string, body: Record<string, unknown>) => {
    const response = await request(actor, method, path, {operationKey: crypto.randomUUID(), ...body});
    assert.ok(response.receipt?.operationKey, `Native receipt for ${path}`);
    receipts.push({actor, path, response});
    return response.value;
  };
  const read = (path: string, actor: DecisionActor = 'owner') => request(actor, 'GET', path);
  const spaces = [];
  for (const name of ['Decision engineering', 'Decision operations']) {
    const space = (await command('owner', 'POST', '/api/containers', {name, visibility: 'default'})).id;
    await command('owner', 'POST', '/api/sharing', {targetKind: 'container', targetId: space, principalKind: 'member', principalId: readerId, level: 'full'});
    spaces.push(space);
  }
  const createPage = async (title: string, containerId: string) => {
    const value = await command('owner', 'POST', '/api/pages', {containerId, title});
    return read('/api/pages/' + value.pageId);
  };
  const source = await createPage('synthetic-slate-1 evidence', spaces[0]);
  const rows: Record<string, any> = {};
  const specs: [string, number, DecisionActor, string | null, string | null][] = [
    ['old', 0, 'owner', '2026-09-10T00:00:00.000Z', '2099-12-10T00:00:00.000Z'],
    ['replacement', 1, 'owner', '2026-09-20T00:00:00.000Z', '2099-12-20T00:00:00.000Z'],
    ['reviewed', 0, 'reader', '2026-09-20T23:59:59.999Z', '2099-12-20T23:59:59.999Z'],
    ['changed', 1, 'reader', '2026-09-30T00:00:00.000Z', '2100-01-10T00:00:00.000Z'],
    ['draft', 0, 'owner', null, null],
    ['later', 1, 'reader', '2026-10-01T00:00:00.000Z', '2100-02-01T00:00:00.000Z'],
    ['private', 0, 'owner', '2026-09-20T00:00:00.000Z', '2099-12-20T00:00:00.000Z'],
    ['removed', 1, 'reader', '2026-09-20T00:00:00.000Z', '2099-12-20T00:00:00.000Z'],
  ];
  const changedSource = await createPage('synthetic-slate-2 changing evidence', spaces[1]);
  for (const [key, space, actor, decidedAt, reviewAt] of specs) {
    const host = await createPage('Decision page ' + key, spaces[space]);
    const citation = key === 'changed' ? changedSource : source;
    const draft = {pageId: host.page.id, question: 'Decision ' + key, options: ['First', 'Second'], outcome: 'First ' + key, rationale: 'Retained reasoning ' + key,
      ownerId: actor === 'owner' ? ownerId : readerId, decidedAt, reviewAt,
      citations: [{kind: 'page', sourceId: citation.page.id, revisionId: citation.workingRevisionId}]};
    let saved = await command(actor, 'POST', '/api/decisions', draft);
    if (key === 'draft') {
      const originalRevision = saved.revisionId;
      draft.outcome = 'Second draft';
      saved = await command(actor, 'POST', '/api/decisions', {...draft, id: saved.id, expectedRevisionId: saved.revisionId});
      const original = await read(`/api/decisions/${saved.id}?revision=${originalRevision}`);
      assert.equal(original.content.outcome, 'First draft');
    }
    let acceptedRevisionId = null;
    if (!['draft', 'later'].includes(key)) {
      saved = await command(actor, 'POST', `/api/decisions/${saved.id}/accept`, {
        expectedRevisionId: saved.revisionId, ...(key === 'replacement' ? {supersedesId: rows.old.id} : {}),
      });
      acceptedRevisionId = saved.revisionId;
    }
    const selected = await read('/api/decisions/' + saved.id);
    assert.equal(selected.acceptedRevisionId, acceptedRevisionId);
    assert.equal(selected.viewedRevisionId, acceptedRevisionId ?? saved.revisionId);
    assert.equal(selected.content.question, draft.question);
    assert.equal(selected.content.outcome, draft.outcome);
    assert.equal(selected.content.rationale, draft.rationale);
    assert.deepEqual(selected.content.citations, draft.citations);
    rows[key] = {...selected, host, expectedAcceptedRevisionId: acceptedRevisionId};
  }
  const reviewed = rows.reviewed;
  await command('reader', 'POST', `/api/decisions/${reviewed.id}/review`, {expectedRevisionId: reviewed.revision_id, note: 'Review completed without changing acceptance', nextReviewAt: '2099-12-20T23:59:59.999Z'});
  await command('owner', 'PATCH', '/api/pages/' + changedSource.page.id, {expectedRevisionId: changedSource.page.revisionId, properties: {title: 'synthetic-slate-3 evidence edited after acceptance'}});
  await command('owner', 'POST', '/api/sharing', {targetKind: 'page', targetId: rows.private.page_id, principalKind: 'member', principalId: ownerId, level: 'full'});
  await command('owner', 'PUT', `/api/sharing/pages/${rows.private.page_id}/inheritance`, {expectedRevisionId: rows.private.host.page.revisionId, restricted: true});
  await command('reader', 'POST', `/api/decisions/${rows.removed.id}/remove`, {expectedRevisionId: rows.removed.revision_id});
  for (const key of Object.keys(rows)) {
    rows[key] = {...rows[key], ...await read('/api/decisions/' + rows[key].id)};
    assert.equal(rows[key].acceptedRevisionId, rows[key].expectedAcceptedRevisionId, key + ' retains its native acceptance receipt');
  }
  assert.equal(rows.old.state, 'superseded');
  assert.notEqual(rows.old.revision_id, rows.old.acceptedRevisionId);
  assert.notEqual(rows.reviewed.revision_id, rows.reviewed.acceptedRevisionId);
  assert.equal(rows.changed.citationsCurrent, false);
  assert.equal(rows.changed.content.rationale, 'Retained reasoning changed');
  assert.equal(rows.draft.content.outcome, 'Second draft');
  assert.deepEqual((await read('/api/pages/' + rows.removed.page_id)).blocks, rows.removed.host.blocks);
  assert.ok((await read(`/api/decisions/${rows.removed.id}/history`)).items.length >= 3);
  const cases = [
    {name: 'all', filter: {}, keys: ['old', 'replacement', 'reviewed', 'changed', 'draft', 'later']},
    {name: 'proposed', filter: {state: 'proposed'}, keys: ['draft', 'later']},
    {name: 'accepted', filter: {state: 'accepted'}, keys: ['replacement', 'reviewed', 'changed']},
    {name: 'superseded', filter: {state: 'superseded'}, keys: ['old']},
    {name: 'first owner', filter: {ownerId}, keys: ['old', 'replacement', 'draft']},
    {name: 'second owner', filter: {ownerId: readerId}, keys: ['reviewed', 'changed', 'later']},
    {name: 'first container', filter: {containerId: spaces[0]}, keys: ['old', 'reviewed', 'draft']},
    {name: 'second container', filter: {containerId: spaces[1]}, keys: ['replacement', 'changed', 'later']},
    {name: 'decided lower day', filter: {decidedFrom: '2026-09-20'}, keys: ['replacement', 'reviewed', 'changed', 'later']},
    {name: 'decided upper day', filter: {decidedTo: '2026-09-20'}, keys: ['old', 'replacement', 'reviewed']},
    {name: 'decided exact day', filter: {decidedFrom: '2026-09-20', decidedTo: '2026-09-20'}, keys: ['replacement', 'reviewed']},
    {name: 'review lower day', filter: {reviewFrom: '2099-12-20'}, keys: ['replacement', 'reviewed', 'changed', 'later']},
    {name: 'review upper day', filter: {reviewTo: '2099-12-20'}, keys: ['old', 'replacement', 'reviewed']},
    {name: 'review exact day', filter: {reviewFrom: '2099-12-20', reviewTo: '2099-12-20'}, keys: ['replacement', 'reviewed']},
    {name: 'current citations', filter: {citationsCurrent: 'true'}, keys: ['old', 'replacement', 'reviewed', 'draft', 'later']},
    {name: 'changed citations', filter: {citationsCurrent: 'false'}, keys: ['changed']},
    {name: 'combined current', filter: {state: 'accepted', ownerId: readerId, containerId: spaces[0], decidedFrom: '2026-09-20', decidedTo: '2026-09-20', reviewFrom: '2099-12-20', reviewTo: '2099-12-20', citationsCurrent: 'true'}, keys: ['reviewed']},
    {name: 'combined changed', filter: {state: 'accepted', ownerId: readerId, containerId: spaces[1], decidedFrom: '2026-09-30', decidedTo: '2026-09-30', reviewFrom: '2100-01-10', reviewTo: '2100-01-10', citationsCurrent: 'false'}, keys: ['changed']},
    {name: 'empty intersection', filter: {state: 'proposed', ownerId, containerId: spaces[1]}, keys: []},
  ];
  return {rows, spaces, cases, receipts};
}

export function assertDecisionMembership(items: any[], rows: Record<string, any>, keys: string[], label: string) {
  assert.deepEqual(items.map(item => item.id).sort(), keys.map(key => rows[key].id).sort(), label);
  for (const item of items) {
    const row = Object.values(rows).find(row => row.id === item.id)!;
    assert.equal(item.question, row.question, label);
    assert.equal(item.acceptedRevisionId, row.acceptedRevisionId, label);
    assert.equal(item.viewedRevisionId, row.acceptedRevisionId ?? row.revision_id, label);
  }
}
