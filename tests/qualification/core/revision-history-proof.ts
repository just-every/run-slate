import {expect, vi} from 'vitest';
import {auditFixture, createUlid, env} from './audit-support';

/** Native receipts, stored snapshots and current authority share the same history. */
export async function revisionHistoryProof(f: Awaited<ReturnType<typeof auditFixture>>) {
  let clock = Date.UTC(2026, 10, 1, 12);
  vi.useFakeTimers({toFake: ['Date'], now: clock});
  const native = async (method: string, path: string, data?: any, actor = f.ownerId) => {
    vi.setSystemTime(clock += 1000);
    const response = await f.request(method, path, data === undefined ? undefined : {operationKey: createUlid(), ...data}, actor);
    expect(response.status, JSON.stringify(response.data)).toBeGreaterThanOrEqual(200);
    expect(response.status, JSON.stringify(response.data)).toBeLessThan(300);
    return response.data;
  };
  try {
    for (const policy of ['autosnapshot', 'labelled']) {
      await f.profile({'page.lifecycle.v1': 'draft-then-publish', 'page.version.v1': policy});
      const db = (await native('POST', '/api/databases', {containerId: f.containerId, title: `History database ${policy}`})).value;
      const field = {id: createUlid(), name: 'Quantity', type: 'number', config: {}, position: 0};
      await native('POST', `/api/databases/${db.id}/fields`, {expectedRevisionId: db.revisionId, field});
      const ordinary = (await native('POST', '/api/pages', {containerId: f.containerId, title: `History page ${policy}`})).value;
      const record = (await native('POST', `/api/databases/${db.id}/records`, {title: `History record ${policy}`, values: {[field.id]: 7}})).value;
      for (const [family, pageId] of [['page', ordinary.pageId], ['database', db.pageId], ['record', record.pageId]]) {
        const path = `/api/pages/${pageId}`, historyPath = `/api/revisions/${pageId}`;
        if (family === 'record') await native('POST', '/api/sharing', {targetKind: 'page', targetId: db.pageId, principalKind: 'member', principalId: f.readerId, level: 'view'});
        await native('POST', '/api/sharing', {targetKind: 'page', targetId: pageId, principalKind: 'member', principalId: f.ownerId, level: 'full'});
        await native('PUT', `/api/sharing/pages/${pageId}/inheritance`, {expectedRevisionId: await f.revision(pageId), restricted: true});
        const grant = await native('POST', '/api/sharing', {targetKind: 'page', targetId: pageId, principalKind: 'member', principalId: f.readerId, level: 'edit'});
        const receipts: any[] = [];
        const capture = async (method: string, route: string, input: any, actor = f.ownerId, origin = 'autosave', ordinal: number | null = null, label: string | null = null) => {
          const result = await native(method, route, input, actor);
          receipts.push({id: result.receipt.revisionId, createdAt: result.receipt.committedAt, authorMemberId: actor, origin, ordinal, label});
          return result;
        };
        const blockId = createUlid();
        await capture('PUT', path + '/blocks', {expectedRevisionId: await f.revision(pageId), blocks: [{id: blockId, blockType: 'paragraph', treePosition: 'a', content: {text: [{text: `Original ${family} body`}]}}]});
        const first = await capture('POST', path + '/publish', {expectedRevisionId: await f.revision(pageId), ...(policy === 'labelled' ? {label: 'Original release'} : {})}, f.ownerId, 'publish', policy === 'labelled' ? 1 : null, policy === 'labelled' ? 'Original release' : null);
        const current = await native('GET', path);
        await capture('PATCH', path + `/blocks/${blockId}`, {expectedRevisionId: current.blocks[0].revisionId, content: {text: [{text: `Current ${family} body`}] }}, f.readerId);
        if (family === 'record') await capture('PATCH', `/api/databases/${db.id}/records/${pageId}`, {expectedRevisionId: await f.revision(pageId), values: {[field.id]: 11}}, f.readerId);
        const second = await capture('POST', path + '/publish', {expectedRevisionId: await f.revision(pageId), ...(policy === 'labelled' ? {label: 'Current release'} : {})}, f.readerId, 'publish', policy === 'labelled' ? 2 : null, policy === 'labelled' ? 'Current release' : null);
        await capture('PATCH', path, {expectedRevisionId: await f.revision(pageId), properties: {title: `Unpublished ${family} title`}});
        const stored = async () => (await env.DB.prepare('SELECT * FROM page_revisions WHERE page_id=? ORDER BY created_at DESC,id DESC').bind(pageId).all<any>()).results;
        const before = await stored();
        const rows = (await native('GET', historyPath)).items;
        expect(rows.map((r: any) => r.id)).toEqual(before.map(r => r.id));
        for (const receipt of receipts) expect(rows.find((r: any) => r.id === receipt.id)).toMatchObject({...receipt, authorDisplayName: receipt.authorMemberId === f.ownerId ? 'Core owner' : 'Core reader'});
        for (const r of before) {
          const snapshot = await native('GET', `${historyPath}/${r.id}`);
          expect(snapshot).toMatchObject({id: r.id, createdAt: r.created_at, blocks: JSON.parse(r.body_json), properties: JSON.parse(r.properties_json)});
        }
        const firstSnapshot = await native('GET', `${historyPath}/${first.receipt.revisionId}`);
        const secondSnapshot = await native('GET', `${historyPath}/${second.receipt.revisionId}`);
        expect(firstSnapshot.blocks[0].content.text[0].text).toBe(`Original ${family} body`);
        expect(secondSnapshot.blocks[0].content.text[0].text).toBe(`Current ${family} body`);
        if (family === 'record') {
          expect(firstSnapshot.properties.databaseFields[field.id]).toBe(7);
          expect(secondSnapshot.properties.databaseFields[field.id]).toBe(11);
        }
        // Even a full member cannot rewrite historical content or its attribution.
        for (const actor of [f.ownerId, f.readerId]) for (const method of ['PATCH', 'PUT', 'POST']) {
          const denied = await f.request(method, `${historyPath}/${first.receipt.revisionId}`, {operationKey: createUlid(), body: [], properties: {title: 'Rewritten'}, origin: 'publish', authorMemberId: f.readerId, createdAt: '2000-01-01T00:00:00.000Z', ordinal: 99, label: 'Rewritten'}, actor);
          expect(denied.status).toBe(404);
          expect(await stored()).toEqual(before);
        }
        // Read-only authority sees published revisions, never the draft autosaves.
        await native('POST', '/api/sharing', {targetKind: 'page', targetId: pageId, id: grant.value.id, principalKind: 'member', principalId: f.readerId, level: 'view'});
        const published = [second.receipt.revisionId, first.receipt.revisionId];
        expect((await native('GET', historyPath, undefined, f.readerId)).items.map((r: any) => r.id)).toEqual(published);
        for (const id of published) expect((await native('GET', `${historyPath}/${id}`, undefined, f.readerId)).id).toBe(id);
        for (const r of before.filter(r => !published.includes(r.id))) expect((await f.request('GET', `${historyPath}/${r.id}`, undefined, f.readerId)).status).toBe(404);
        await native('POST', '/api/sharing', {targetKind: 'page', targetId: pageId, id: grant.value.id, principalKind: 'member', principalId: f.readerId, level: 'view', revoke: true});
        for (const route of [historyPath, ...before.map(r => `${historyPath}/${r.id}`)]) {
          const denied = await f.request('GET', route, undefined, f.readerId);
          expect(denied).toEqual({status: 404, data: {code: 'NOT_FOUND', message: 'Not found.'}});
        }
        expect(await stored()).toEqual(before);
        console.info(`PROBE REV-002 ${policy} ${family}: native list and snapshots -> ${before.length} exact newest-first rows; receipts, actors, times, origins, labels, immutable writes, published-only reads and revoked refusal passed`);
      }
    }
  } finally { vi.useRealTimers(); }
}
