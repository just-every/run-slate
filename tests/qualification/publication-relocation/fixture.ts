import { env } from 'cloudflare:test';
import { beforeEach, expect } from 'vitest';
import { createApi } from '../../../src/core/app/hono';
import { createPage } from '../../../src/core/features/pages/service';
import { scenario, key } from '../policies/helpers';
import { seedContainer, seedContainerGrant, sessionFor } from '../../e2e/setup/fixtures';
import { resetDeployment } from '../../e2e/setup/reset-deployment';
import type { PublicationPreviewResponse } from '../../../src/core/features/lifecycle/publication-preview';

// Each independent case owns one deployment and its WORK-001 workspace.
beforeEach(resetDeployment);

export { env, key };
export async function fixture(crossContainer = true, draft = false) {
  const s = await scenario();
  const target = crossContainer ? (await seedContainer(s.owner.actor.workspaceId, { ownerMemberId: s.owner.actor.id, visibility: 'private' })).containerId : s.containerId;
  if (crossContainer) await seedContainerGrant(target, { principalKind: 'member', principalId: s.owner.actor.id, level: 'full' });
  let destinationGrantId = '';
  for (const containerId of new Set([s.containerId, target])) {
    const grant = await seedContainerGrant(containerId, { principalKind: 'member', principalId: s.reader.actor.id, level: 'edit' });
    if (containerId === target) destinationGrantId = grant.grantId;
  }
  const page = async (title: string, containerId: string, parentPageId?: string) => createPage(s.owner, { operationKey: key(title), title, containerId, parentPageId });
  const root = await createPage(s.owner, { operationKey: key('q9-root'), title: 'Relocation root', containerId: s.containerId, lifecycle: draft ? 'draft' : 'live' });
  const child = await page('q9-child', s.containerId, root.value.pageId);
  const grandchild = await page('q9-grandchild', s.containerId, child.value.pageId), parent = await page('q9-parent', target);
  const bystander = await page('q9-bystander', s.containerId);
  const api = createApi(), cookie = await sessionFor(s.reader.actor.id);
  const request = (path: string, body?: unknown) => api.request(`https://slate.example/api/pages/${root.value.pageId}${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, env);
  const input = { operationKey: key('q9-publish'), expectedRevisionId: root.receipt.revisionId, destination: { containerId: target, parentPageId: parent.value.pageId, treePosition: 'q9-position' } };
  const preview = async () => {
    const response = await request('/publish-preview', input);
    expect(response.status, await response.clone().text()).toBe(200);
    return response.json() as Promise<PublicationPreviewResponse>;
  };
  return { ...s, root, child, grandchild, parent, bystander, target, destinationGrantId, input, request, preview };
}

/** Whole durable product tables: denied and replayed writes must preserve them. */
export async function state(): Promise<Record<string, Record<string, unknown>[]>> {
  const tables = ['pages', 'page_blocks', 'page_revisions', 'page_grants', 'public_exposures', 'content_events', 'activity_entries', 'operation_receipts', 'notifications', 'notification_outbox', 'content_schedules'];
  return Object.fromEntries(await Promise.all(tables.map(async table => [table, (await env.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results])));
}
