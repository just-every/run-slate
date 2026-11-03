import assert from 'node:assert/strict';

const key = () => crypto.randomUUID();

/** Native routes only; the caller supplies authenticated transports, never application responses. */
export async function duplicationFixture(send, { ownerId, readerId, host }) {
  const call = async (method, route, data, who = 'owner') => {
    const response = await send(method, route, data, who);
    assert.equal(response.status, 200, `${method} ${route}: ${JSON.stringify(response.data)}`);
    return response.data;
  };
  const sourceSpace = (await call('POST', '/api/containers', { operationKey: key(), name: 'Duplication source', visibility: 'private' })).value.id;
  const destinationSpace = (await call('POST', '/api/containers', { operationKey: key(), name: 'Duplication destination', visibility: 'private' })).value.id;
  await call('POST', '/api/sharing', { operationKey: key(), targetKind: 'container', targetId: destinationSpace, principalKind: 'member', principalId: readerId, level: 'view' });
  const destinationParent = (await call('POST', '/api/pages', { operationKey: key(), containerId: destinationSpace, title: 'Copies belong here' })).value.pageId;
  await call('POST', '/api/sharing', { operationKey: key(), targetKind: 'page', targetId: destinationParent, principalKind: 'member', principalId: readerId, level: 'comment' });
  const sourceIds = [];
  async function source(title, parentPageId = null, treePosition = '10') {
    const first = key(), nested = key();
    const blocks = [
      { id: first, blockType: 'heading', treePosition: '10', content: { level: 2, text: [{ text: `Body of ${title}`, marks: ['bold'] }] } },
      { id: nested, parentBlockId: first, blockType: 'paragraph', treePosition: '20', content: { text: [{ text: 'Nested retained text', marks: ['italic'], colour: 'blue' }] } },
    ];
    const created = await call('POST', '/api/pages', { operationKey: key(), containerId: sourceSpace, parentPageId, treePosition, title: `${title} before edit`, blocks,
      properties: { icon: '📚', cover: { kind: 'gallery', id: 'ocean' }, labels: ['duplication', 'retained'], typeface: 'serif', smallText: true, fullWidth: true } });
    const id = created.value.pageId;
    sourceIds.push(id);
    await call('PATCH', `/api/pages/${id}`, { operationKey: key(), expectedRevisionId: created.value.revisionId, properties: { title } });
    // Every copied generation has real excluded data, not just the root.
    await call('POST', '/api/sharing', { operationKey: key(), targetKind: 'page', targetId: id, principalKind: 'member', principalId: readerId, level: 'full' });
    const document = await call('GET', `/api/pages/${id}`);
    await call('POST', `/api/comments/page/${id}`, { operationKey: key(), kind: 'inline', blockId: nested, anchorRevisionId: document.page.revisionId, anchor: { anchorId: key(), quote: 'Nested retained text' }, body: [{ text: `Private review of ${title}` }] });
    await call('PUT', '/api/navigation/watches', { operationKey: key(), pageId: id, enabled: true }, 'reader');
    for (const who of ['owner', 'reader', 'reader']) await call('POST', '/api/analytics/views', { operationKey: key(), pageId: id }, who);
    await call('POST', `/api/publishing/${id}`, { operationKey: key(), expectedRevisionId: document.page.revisionId, host, slug: `duplicate-${id}`, indexable: false, theme: 'default', headerControls: [], duplicateAsTemplate: false, socialPreview: {}, revoke: false });
    return id;
  }
  const root = await source('Duplication handbook');
  // Create siblings out of display order so a copy must preserve explicit order.
  const later = await source('Later child', root, '20');
  const earlier = await source('Earlier child', root, '10');
  const grandchild = await source('Nested grandchild', earlier);
  const fixture = { call, send, ownerId, readerId, sourceSpace, destinationSpace, destinationParent, sourceIds, root, earlier, later, grandchild };
  const populated = await duplicationSnapshot(fixture);
  for (const row of populated.pages) {
    assert.equal(row.comments.threads.length, 1);
    assert.ok(row.history.items.length >= 2);
    assert.equal(row.analytics.totalViews, 3);
    assert.ok(row.grants.items.some(grant => grant.principalId === readerId && grant.level === 'full'));
    assert.ok(row.exposure.exposure && !row.exposure.exposure.revokedAt);
    assert.equal(row.watched.reader, true);
  }
  return fixture;
}

export async function duplicationSnapshot(fixture, ids = fixture.sourceIds) {
  const { call } = fixture;
  const navigation = { owner: await call('GET', '/api/navigation'), reader: await call('GET', '/api/navigation', undefined, 'reader') };
  const tree = (await call('GET', '/api/pages')).items;
  const pages = [];
  for (const id of ids) {
    const history = await call('GET', `/api/revisions/${id}`);
    pages.push({
      document: await call('GET', `/api/pages/${id}`),
      placement: tree.find(item => item.id === id),
      history,
      revisions: await Promise.all(history.items.map(item => call('GET', `/api/revisions/${id}/${item.id}`))),
      comments: await call('GET', `/api/comments/page/${id}`),
      analytics: await call('GET', `/api/analytics?pageId=${id}`),
      grants: await call('GET', `/api/sharing/pages/${id}`),
      exposure: await call('GET', `/api/publishing/${id}`),
      watched: Object.fromEntries(Object.entries(navigation).map(([who, value]) => [who, value.watches.includes(id)])),
    });
  }
  return { pages };
}

/** Reconcile complete snapshots with fresh identities and only destination authority. */
export async function assertDuplication(fixture, before, copyId, includeChildren) {
  const { call, sourceIds, destinationSpace, destinationParent, readerId } = fixture;
  const after = await duplicationSnapshot(fixture);
  assert.deepEqual(after, before, 'Duplication leaves all source content and excluded families unchanged.');
  const tree = (await call('GET', '/api/pages')).items;
  const ids = [copyId];
  for (let index = 0; index < ids.length; index++) ids.push(...tree.filter(item => item.parentPageId === ids[index]).map(item => item.id));
  assert.equal(ids.length, includeChildren ? sourceIds.length : 1, 'Only the selected subtree is copied.');
  const copy = await duplicationSnapshot(fixture, ids);
  const mapping = new Map([[fixture.root, copyId]]);
  for (const source of before.pages) {
    const original = source.document;
    if (!includeChildren && original.page.id !== fixture.root) continue;
    const row = copy.pages.find(item => item.document.page.title === original.page.title);
    assert.ok(row, `Copied ${original.page.title}`);
    mapping.set(original.page.id, row.document.page.id);
  }
  const allOldBlocks = new Set(before.pages.flatMap(row => row.document.blocks.map(block => block.id)));
  const allNewBlocks = copy.pages.flatMap(row => row.document.blocks.map(block => block.id));
  assert.equal(new Set(allNewBlocks).size, allNewBlocks.length);
  for (const source of before.pages) {
    const original = source.document, id = mapping.get(original.page.id);
    if (!id) continue;
    const row = copy.pages.find(item => item.document.page.id === id), document = row.document;
    assert.ok(!sourceIds.includes(id), 'Copies have fresh page identifiers.');
    assert.equal(document.page.containerId, destinationSpace);
    assert.equal(document.parentPageId, original.page.id === fixture.root ? destinationParent : mapping.get(original.parentPageId));
    assert.deepEqual(document.properties, original.properties);
    if (original.page.id !== fixture.root) assert.equal(row.placement.treePosition, source.placement.treePosition);
    assert.equal(document.blocks.length, original.blocks.length);
    const blocks = new Map(original.blocks.map((block, index) => [block.id, document.blocks[index].id]));
    for (const [index, block] of document.blocks.entries()) {
      const old = original.blocks[index];
      assert.ok(!allOldBlocks.has(block.id), 'Copies have fresh block identifiers.');
      assert.equal(block.pageId, id);
      assert.notEqual(block.revisionId, old.revisionId);
      assert.equal(block.parentBlockId, old.parentBlockId ? blocks.get(old.parentBlockId) : null);
      assert.equal(block.blockType, old.blockType);
      assert.equal(block.treePosition, old.treePosition);
      // Inline discussion anchors belong to the source, not the copied text.
      const content = JSON.parse(JSON.stringify(old.content), (name, value) => name === 'commentAnchorId' ? undefined : value);
      assert.deepEqual(block.content, content);
    }
    assert.equal(row.history.items.length, 1, 'Only the copy creation revision is present.');
    assert.equal(row.history.items[0].id, document.workingRevisionId);
    assert.ok(!before.pages.some(page => page.history.items.some(item => item.id === row.history.items[0].id)));
    assert.deepEqual(row.revisions[0].blocks, document.blocks);
    assert.deepEqual(row.comments.threads, []);
    assert.equal(row.watched.reader, false, 'A source watcher is not copied.');
    assert.equal(row.analytics.totalViews, 0, 'Source readership is not copied.');
    assert.equal(row.exposure.exposure, null);
    assert.deepEqual(row.grants.items, [], 'No explicit source grant is copied.');
    assert.equal(row.grants.restricted, false);
    assert.ok(row.grants.effectiveItems.length > 0);
    assert.ok(row.grants.effectiveItems.every(grant => grant.inherited && (grant.origin.id === destinationSpace || grant.origin.id === destinationParent)));
    assert.ok(row.grants.effectiveItems.some(grant => grant.principalId === readerId && grant.level === 'comment' && grant.origin.id === destinationParent));
    const reader = await call('GET', `/api/pages/${id}`, undefined, 'reader');
    assert.equal(reader.permissions.level, 'comment', 'Current access comes from the selected destination.');
    assert.equal(reader.permissions.canEdit, false);
    const refused = await fixture.send('PATCH', `/api/pages/${id}`, { operationKey: key(), expectedRevisionId: reader.page.revisionId, properties: { title: 'Must not write' } }, 'reader');
    assert.equal(refused.status, 404);
    assert.deepEqual(await call('GET', `/api/pages/${id}`), document, 'Refused writes change nothing.');
  }
  if (includeChildren) {
    const children = tree.filter(item => item.parentPageId === copyId);
    assert.deepEqual(children.map(item => item.title), ['Earlier child', 'Later child'], 'Child display order is preserved.');
  }
  return { before, after, copy, mapping: Object.fromEntries(mapping) };
}
