import { env } from 'cloudflare:test';
import { test, expect } from 'vitest';
import { createUlid } from '../../../src/core/shared/ulid';
import { createPublicApiRoutes } from '../../../src/core/features/public-api/routes';
import { operations } from '../../../src/core/features/public-api/definitions';
import { apiFixture, assertSchema } from './support';
import limits from '../../../seed.json';
import { tokenCustody } from './custody';

test('personal API tokens run the published HTTP contract with member parity, task effects and immediate authority loss', async () => {
  const f = await apiFixture(), ownerToken = await f.mint(), memberToken = await f.mint(f.member), readToken = await f.mint(f.owner, 'read');
  const own = { token: ownerToken.secret }, denied = { token: memberToken.secret };
  const doc = await f.ok('/api/v1/openapi.json', 'GET', undefined, {});
  const declared = Object.entries(doc.paths).flatMap(([path, methods]: any) => Object.entries(methods).map(([method, operation]: any) => ({ path, method, operation })));
  expect(declared.map(d => d.operation.operationId).sort()).toEqual(operations.map(o => o.id).sort());
  expect(createPublicApiRoutes().routes.filter(route=>route.path!=='/openapi.json'&&route.method!=='ALL').map(route=>route.method+' '+route.path).sort()).toEqual(declared.map(d=>d.method.toUpperCase()+' '+d.path.replace(/\{(\w+)\}/g,':$1')).sort());
  await env.DB.prepare('UPDATE container_grants SET revoked_at=? WHERE id=?').bind(new Date().toISOString(), f.grant.grantId).run();
  const initial = await f.ok('/api/pages', 'POST', { operationKey: createUlid(), containerId: f.containerId, title: 'synthetic-slate-public-page', blocks: [{ id: createUlid(), blockType: 'task', treePosition: '1', content: { text: [{ text: 'Publish the handbook' }], done: false } }] });
  const pageId = initial.value.pageId, read = () => f.ok(`/api/pages/${pageId}`);
  let page = await read();
  for (const { path, method, operation } of declared) {
    page = await read();
    const block = page.blocks[0];
    const endpoint = path.replace('{pageId}', pageId).replace('{blockId}', block.id) + (operation.operationId === 'listPages' ? `?containerId=${f.containerId}` : '');
    const payloads: Record<string, unknown> = {
      createPage: { operationKey: createUlid(), containerId: f.containerId, title: 'synthetic-slate-created' },
      updatePage: { operationKey: createUlid(), expectedRevisionId: page.page.revisionId, properties: { title: 'synthetic-slate-updated' } },
      replaceBlocks: { operationKey: createUlid(), expectedRevisionId: page.page.revisionId, blocks: page.blocks.map((b: any) => ({ id: b.id, blockType: b.blockType, treePosition: b.treePosition, content: b.content })) },
      updateBlock: { operationKey: createUlid(), expectedRevisionId: block.revisionId, content: { ...block.content, text: [{ text: 'Updated handbook task' }] } },
      updateTask: { operationKey: createUlid(), expectedRevisionId: block.revisionId, content: { ...block.content, dueDate: '2030-04-05' } },
    };
    const body = payloads[operation.operationId];
    const hidden = await f.request('/api/v1' + endpoint, method.toUpperCase(), body, denied);
    const uiPath = operation.operationId === 'listPages' ? `/api/pages?containerId=${f.containerId}` : operation.operationId === 'createPage' ? '/api/pages' : `/api/pages/${pageId}`;
    const ui = await f.request(uiPath, operation.operationId === 'createPage' ? 'POST' : 'GET', operation.operationId === 'createPage' ? body : undefined, { member: f.member });
    expect(hidden.status).toBe(ui.status);
    if (hidden.status === 200) expect(hidden.data.items).toEqual(ui.data.items);
    else assertSchema(operation.responses[String(hidden.status)].content['application/json'].schema, hidden.data);
    const result = await f.request('/api/v1' + endpoint, method.toUpperCase(), body, own);
    expect(result.status, JSON.stringify(result.data)).toBe(200);
    assertSchema(operation.responses['200'].content['application/json'].schema, result.data);
    if (method === 'get') {
      const native = await read();
      if (operation.operationId === 'getPage') expect(result.data).toEqual(native);
      if (operation.operationId === 'listBlocks' || operation.operationId === 'listTasks') expect(result.data.items).toEqual(native.blocks);
    }
  }
  const cookieOnly = await f.request(`/api/v1/pages/${pageId}`);
  expect(cookieOnly.status).toBe(401); assertSchema(doc.paths['/pages/{pageId}'].get.responses['401'].content['application/json'].schema, cookieOnly.data);
  expect((await f.request('/api/developer/tokens', 'POST', { operationKey: createUlid(), name: 'synthetic-slate-guest', scopes: [{ containerId: f.containerId, level: 'read' }] }, { member: f.guest })).status).toBe(403);
  expect((await f.request('/api/v1/pages', 'POST', { operationKey: createUlid(), containerId: f.containerId, title: 'Not allowed' }, { token: readToken.secret })).status).toBe(403);
  const write = { operationKey: createUlid(), containerId: f.containerId, title: 'synthetic-slate-replay' };
  expect(await f.ok('/api/v1/pages', 'POST', write, own)).toEqual(await f.ok('/api/v1/pages', 'POST', write, own));
  const first = await f.ok(`/api/v1/pages?containerId=${f.containerId}&limit=1`, 'GET', undefined, own);
  expect(first.items).toHaveLength(1); expect(first.nextCursor).toBeTruthy();
  const next = await f.ok(`/api/v1/pages?containerId=${f.containerId}&limit=1&cursor=${encodeURIComponent(first.nextCursor)}`, 'GET', undefined, own);
  expect(next.items[0].id).not.toBe(first.items[0].id);
  // The same task door as the UI refuses an unreadable assignee, then assigns after deliberate sharing.
  const task = async () => (await read()).blocks[0];
  const change = async (actor: {token: string}, content: any) => { const b = await task(); return f.request(`/api/v1/pages/${pageId}/tasks/${b.id}`, 'PATCH', { operationKey: createUlid(), expectedRevisionId: b.revisionId, content: { ...b.content, ...content } }, actor); };
  const refusal = await change(own, { assigneeMemberId: f.member });
  expect(refusal.status).toBe(409); expect(refusal.data.error.code).toBe('TASK_ASSIGNEE_ACCESS_NEEDED');
  const b = await task(); const uiRefusal = await f.request(`/api/pages/${pageId}/blocks/${b.id}`, 'PATCH', { operationKey: createUlid(), expectedRevisionId: b.revisionId, content: { ...b.content, assigneeMemberId: f.member } });
  expect(uiRefusal.status).toBe(refusal.status); expect(uiRefusal.data.code).toBe(refusal.data.error.code);
  await f.share(pageId, f.member); await f.share(pageId, f.other);
  expect((await change(own, { assigneeMemberId: f.member, dueDate: '2030-04-06' })).status).toBe(200);
  const notices = async (member: string) => (await f.ok('/api/notifications', 'GET', undefined, { member })).items;
  expect((await notices(f.member)).filter((n: any) => n.event === 'task-assigned')).toHaveLength(1);
  expect((await change(own, { assigneeMemberId: f.other })).status).toBe(200);
  expect((await notices(f.member)).filter((n: any) => n.event === 'task-assigned')).toHaveLength(1);
  expect((await notices(f.other)).filter((n: any) => n.event === 'task-assigned')).toHaveLength(1);
  expect((await change(own, { assigneeMemberId: f.member })).status).toBe(200);
  const before = await Promise.all([f.owner, f.member, f.other].map(notices));
  expect((await change(denied, { done: true })).status).toBe(200);
  expect(await Promise.all([f.owner, f.member, f.other].map(notices))).toEqual(before);
  expect((await task()).content).toMatchObject({ done: true, completedByMemberId: f.member, completedAt: expect.any(String), dueDate: '2030-04-06' });
  // Metadata is visible only to its member or an owner. No response recovers custody material.
  const ownList = await f.ok('/api/developer/tokens', 'GET', undefined, { member: f.member });
  expect(ownList.items.map((t: any) => t.id)).toEqual([memberToken.value.id]);
  expect(ownList.items[0].lastUsedAt).toBeTruthy(); expect(JSON.stringify(ownList).includes(memberToken.secret)).toBe(false);
  const ownerList = await f.ok('/api/developer/tokens'); expect(ownerList.items.some((t: any) => t.id === memberToken.value.id)).toBe(true);
  await f.ok(`/api/developer/tokens/${memberToken.value.id}/revoke`, 'POST', { operationKey: createUlid() });
  expect((await f.request(`/api/v1/pages/${pageId}`, 'GET', undefined, denied)).status).toBe(401);
  const expired = await f.mint(); await env.DB.prepare('UPDATE public_api_tokens SET expires_at=? WHERE id=?').bind('2000-01-01T00:00:00Z', expired.value.id).run();
  expect((await f.request(`/api/v1/pages/${pageId}`, 'GET', undefined, { token: expired.secret })).status).toBe(401);
  const rateToken = await f.mint(); let rate;
  for (let i = 0; i <= limits.limits.publicApiRequestsPerTokenPerMinute; i++) rate = await f.request(`/api/v1/pages/${pageId}`, 'GET', undefined, { token: rateToken.secret });
  expect(rate!.status).toBe(429); expect(Number(rate!.headers.get('retry-after'))).toBeGreaterThan(0);
  const anotherSpace=await f.ok('/api/containers','POST',{operationKey:createUlid(),name:'synthetic-slate-private',visibility:'private'});
  const privatePage=await f.ok('/api/pages','POST',{operationKey:createUlid(),containerId:anotherSpace.value.id,title:'synthetic-slate-outside-scope'});
  const currentTask=await task();
  await f.ok(`/api/pages/${pageId}/blocks/${currentTask.id}`,'PATCH',{operationKey:createUlid(),expectedRevisionId:currentTask.revisionId,content:{...currentTask.content,text:[{text:'Reference '},{text:'synthetic-slate-outside-scope',mention:{kind:'page',id:privatePage.value.pageId}}]}});
  const scopedPage=await f.ok(`/api/v1/pages/${pageId}`,'GET',undefined,own);
  expect(scopedPage.mentions[privatePage.value.pageId].available).toBe(false);
  expect(JSON.stringify(scopedPage).includes('synthetic-slate-outside-scope')).toBe(false);
  expect((await f.request(`/api/v1/pages/${privatePage.value.pageId}`,'GET',undefined,own)).status).toBe(403);
  const narrowed=await f.mint();
  await env.DB.prepare('UPDATE public_api_tokens SET scopes_json=? WHERE id=?').bind(JSON.stringify([{containerId:f.containerId,level:'read'}]),narrowed.value.id).run();
  expect((await f.request('/api/v1/pages','POST',{operationKey:createUlid(),containerId:f.containerId,title:'Denied after narrowing'},{token:narrowed.secret})).status).toBe(403);
  await tokenCustody(f, ownerToken.secret);
  await f.ok('/api/sharing', 'POST', {operationKey:createUlid(),id:f.grant.grantId,targetKind:'container',targetId:f.containerId,principalKind:'member',principalId:f.member,level:'edit'});
  const removedToken=await f.mint(f.member);
  await f.ok('/api/members/remove','POST',{operationKey:createUlid(),memberId:f.member});
  expect((await f.request(`/api/v1/pages/${pageId}`,'GET',undefined,{token:removedToken.secret})).status).toBe(401);
  expect(!!await env.DB.prepare('SELECT id FROM public_api_tokens WHERE id=? AND revoked_at IS NOT NULL').bind(removedToken.value.id).first()).toBe(true);
  await f.ok('/api/members/remove','POST',{operationKey:createUlid(),memberId:f.member,erase:true});
  expect(await env.DB.prepare('SELECT count(*) AS n FROM public_api_tokens WHERE member_id=?').bind(f.member).first<number>('n')).toBe(0);
  for (const action of ['api-token.grant', 'api-token.use', 'api-token.revoke', 'api-token.expired']) {
    const activity = await f.ok('/api/activity?action=' + action);
    expect(activity.items.some((a: any) => a.action === action)).toBe(true);
    expect(JSON.stringify(activity).includes(ownerToken.secret)).toBe(false);
  }
});
