import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {inbox, newOutboxLink} from '../e2e/outbox-auth.mjs';

/**
 * A populated installation built only through Slate's public routes and the
 * fake paid mail edge: nested trees, revisions, anchored comments,
 * links and mentions, groups, a guest, restricted pages, files, a published
 * page, a pending invitation and live sessions for two members.
 */
export function http(origin, devKey) {
  const call = async (cookie, method, path, body, headers = {}) => {
    const init = { method, headers: { origin, ...(cookie ? { cookie } : {}), ...headers }, redirect: 'manual' };
    if (body instanceof FormData || body instanceof URLSearchParams) init.body = body;
    else if (body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
    const response = await fetch(origin + path, init);
    const text = await response.text();
    let json; try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
    return { status: response.status, body: json, text, headers: response.headers };
  };
  const ok = async (cookie, method, path, body) => {
    const result = await call(cookie, method, path, body);
    assert.ok(result.status >= 200 && result.status < 300, `${method} ${path}: ${result.status} ${result.text.slice(0, 300)}`);
    return result.body;
  };
  const outbox = () => inbox(origin);
  const link = async (before, pathname) => {
    const target = new URL(await newOutboxLink(origin, before));
    assert.equal(target.pathname, pathname);
    return target;
  };
  const sessionFrom = response => response.headers.get('set-cookie')?.split(';', 1)[0];
  return {
    origin, call, ok, outbox, link,
    /** A native email sign-in link, confirmed by its same-origin POST. */
    async signIn(email) {
      const before = await outbox();
      assert.equal((await call(null, 'POST', '/api/auth/magic', { email, requestKey: randomUUID() })).status, 200);
      const target = await link(before, '/auth/confirm');
      const confirmed = await call(null, 'POST', '/auth/confirm', new URLSearchParams({ token: target.searchParams.get('token') }));
      assert.equal(confirmed.status, 303, `sign-in for ${email} confirms`);
      return { cookie: sessionFrom(confirmed), link: target.href };
    },
    /** Sends an invitation and, unless it should stay pending, accepts it. */
    async invite(ownerCookie, input, accept = true) {
      const before = await outbox();
      await ok(ownerCookie, 'POST', '/api/invitations', { operationKey: randomUUID(), kind: 'member', ...input });
      const target = await link(before, '/api/auth/invitation/accept');
      if (!accept) return { link: target.href };
      const accepted = await call(null, 'POST', '/api/auth/invitation/accept', new URLSearchParams({ token: target.searchParams.get('token') }));
      assert.equal(accepted.status, 303, `${input.email} accepts the invitation`);
      const cookie = sessionFrom(accepted);
      return { cookie, link: target.href, member: (await ok(cookie, 'GET', '/api/session')).member };
    },
  };
}

const text = value => ({ text: [{ text: value }] });

export async function populate(api, owner, { pagesPerSpace = 100, files = 4 } = {}) {
  const { ok, call } = api;
  const made = { pages: [], spaces: [], files: [], threads: [], restricted: [], links: [] };
  await ok(owner, 'POST', '/api/workspace/first-run', { operationKey: randomUUID(), workspaceName: 'Harbor operations', containerName: 'Handbook', pageTitle: 'Welcome' });
  const bob = await api.invite(owner, { email: 'bob@example.test' });
  const carol = await api.invite(owner, { email: 'carol@example.test' });
  const group = await ok(owner, 'POST', '/api/groups', { operationKey: randomUUID(), name: 'Support rota', memberIds: [bob.member.id] });
  const groupId = group.value?.id ?? group.id;
  const spaces = (await ok(owner, 'GET', '/api/containers')).items.filter(item => item.visibility !== 'personal');
  made.spaces.push(spaces[0].id);
  for (const name of ['Engineering', 'Customer support']) {
    const created = await ok(owner, 'POST', '/api/containers', { operationKey: randomUUID(), name });
    made.spaces.push(created.value?.id ?? created.id);
  }
  // Bob comments in the Handbook and edits Engineering directly; the Support rota group comments in Customer support.
  await ok(owner, 'POST', '/api/sharing', { operationKey: randomUUID(), targetKind: 'container', targetId: made.spaces[0], principalKind: 'member', principalId: bob.member.id, level: 'comment' });
  await ok(owner, 'POST', '/api/sharing', { operationKey: randomUUID(), targetKind: 'container', targetId: made.spaces[1], principalKind: 'member', principalId: bob.member.id, level: 'edit' });
  await ok(owner, 'POST', '/api/sharing', { operationKey: randomUUID(), targetKind: 'container', targetId: made.spaces[2], principalKind: 'group', principalId: groupId, level: 'comment' });
  // Nested trees: in each space, top pages with children and grandchildren.
  for (const [spaceIndex, containerId] of made.spaces.entries()) {
    for (let index = 0; made.pages.filter(page => page.containerId === containerId).length < pagesPerSpace; index++) {
      const top = await createPage(api, owner, containerId, null, `S${spaceIndex} Topic ${index}`);
      made.pages.push(top);
      for (let child = 0; child < 4; child++) {
        const page = await createPage(api, owner, containerId, top.id, `S${spaceIndex} Topic ${index}.${child}`);
        made.pages.push(page);
        const leaf = await createPage(api, owner, containerId, page.id, `S${spaceIndex} Topic ${index}.${child}.0`);
        made.pages.push(leaf);
      }
    }
  }
  const pick = index => made.pages[index % made.pages.length];
  // Links and mentions between pages, then several revisions of each linking page.
  for (let index = 0; index < 20; index++) {
    const from = pick(index * 7), to = pick(index * 7 + 3);
    const document = await ok(owner, 'GET', `/api/pages/${from.id}`);
    const block = document.blocks[0];
    for (let edit = 0; edit < 3; edit++) {
      const current = (await ok(owner, 'GET', `/api/pages/${from.id}`)).blocks[0];
      await ok(owner, 'PATCH', `/api/pages/${from.id}/blocks/${block.id}`, { operationKey: randomUUID(), expectedRevisionId: current.revisionId,
        content: { text: [{ text: `Revision ${edit} of ${from.title}, see ` }, { text: to.title, mention: { kind: 'page', label: to.title, id: to.id } }, { text: ' and ' }, { text: to.title, link: { href: `/app/pages/${to.id}` } }, { text: '.' }] } });
    }
    made.links.push({ from: from.id, to: to.id });
  }
  // Inline comments anchored to text, with replies.
  for (let index = 0; index < 10; index++) {
    const page = pick(150 + index * 11), anchorId = randomUUID();
    const document = await ok(owner, 'GET', `/api/pages/${page.id}`);
    const block = document.blocks[0];
    await ok(owner, 'PATCH', `/api/pages/${page.id}/blocks/${block.id}`, { operationKey: randomUUID(), expectedRevisionId: block.revisionId, content: { text: [{ text: 'Owner: ' }, { text: 'the on-call lead', commentAnchorId: anchorId }, { text: ` for ${page.title}.` }] } });
    const anchored = await ok(owner, 'GET', `/api/pages/${page.id}`);
    await ok(owner, 'POST', `/api/comments/page/${page.id}`, { operationKey: randomUUID(), kind: 'inline', blockId: block.id, anchor: { anchorId, quote: 'the on-call lead' }, anchorRevisionId: anchored.workingRevisionId, body: [{ text: `Who is on call for ${page.title}?` }] });
    const thread = (await ok(owner, 'GET', `/api/comments/page/${page.id}`)).threads[0];
    await ok(bob.cookie, 'POST', `/api/comments/page/${page.id}`, { operationKey: randomUUID(), threadId: thread.id, body: [{ text: 'Bob is.' }] });
    made.threads.push({ pageId: page.id, threadId: thread.id });
  }
  // Restricted pages: only their direct grants open them.
  const ownerId = (await ok(owner, 'GET', '/api/session')).member.id;
  for (let index = 0; index < 8; index++) {
    const page = pick(made.pages.length - 1 - index * 5);
    await grant(api, owner, page.id, { principalKind: 'member', principalId: ownerId, level: 'full' });
    // Bob directly, Bob through the Support rota group, or the owner alone.
    if (index % 3 === 0) await grant(api, owner, page.id, { principalKind: 'member', principalId: bob.member.id, level: 'edit' });
    if (index % 3 === 1) await grant(api, owner, page.id, { principalKind: 'group', principalId: groupId, level: 'view' });
    const document = await ok(owner, 'GET', `/api/pages/${page.id}`);
    await ok(owner, 'PUT', `/api/sharing/pages/${page.id}/inheritance`, { operationKey: randomUUID(), expectedRevisionId: document.page.revisionId, restricted: true });
    made.restricted.push(page.id);
  }
  // A guest invited to one page, and a member invitation left pending.
  const guestPage = pick(5);
  const guest = await api.invite(owner, { email: 'guest@example.test', kind: 'guest', pageId: guestPage.id, level: 'comment' });
  const pending = await api.invite(owner, { email: 'dana@example.test' }, false);
  // Files on pages.
  for (let index = 0; index < files; index++) {
    const page = pick(index * 13 + 2), bytes = Buffer.from(`Attachment ${index} for ${page.title}\n`.repeat(50 + index));
    const form = new FormData();
    form.set('operationKey', randomUUID()); form.set('pageId', page.id); form.set('file', new Blob([bytes], { type: 'text/plain' }), `notes-${index}.txt`);
    const uploaded = await ok(owner, 'POST', '/api/media', form);
    made.files.push({ id: uploaded.value.id, pageId: page.id, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  // A published page with a public slug.
  const published = made.pages[0];
  let document = await ok(owner, 'GET', `/api/pages/${published.id}`);
  if (!document.publishedRevisionId) {
    await ok(owner, 'POST', `/api/pages/${published.id}/publish`, { operationKey: randomUUID(), expectedRevisionId: document.page.revisionId });
    document = await ok(owner, 'GET', `/api/pages/${published.id}`);
  }
  const slug = 'handbook/on-call';
  await ok(owner, 'POST', `/api/publishing/${published.id}`, { operationKey: randomUUID(), expectedRevisionId: document.page.revisionId, host: new URL(api.origin).host, slug, indexable: false, theme: 'default', headerControls: [], duplicateAsTemplate: false, socialPreview: {}, revoke: false });
  return { ...made, bob, carol, guest, pending, groupId, slug, published: published.id, guestPage: guestPage.id };
}

async function createPage({ ok }, cookie, containerId, parentPageId, title) {
  const blocks = [{ id: randomUUID(), blockType: 'paragraph', content: text(`${title}: the procedure the team follows.`), treePosition: 'a0' }];
  const created = await ok(cookie, 'POST', '/api/pages', { operationKey: randomUUID(), containerId, ...(parentPageId ? { parentPageId } : {}), title, blocks });
  return { id: created.value.pageId, title, containerId, parentPageId };
}
async function grant({ ok }, cookie, pageId, input) {
  return ok(cookie, 'POST', '/api/sharing', { operationKey: randomUUID(), targetKind: 'page', targetId: pageId, ...input });
}

/** Identifiers, order and relationships read straight from the stopped local D1. */
export const snapshotQueries = {
  pages: 'SELECT id,container_id,parent_page_id,tree_position,title,revision_id,working_revision_id,access_inheritance FROM pages ORDER BY id',
  revisions: 'SELECT id,page_id,content_hash FROM page_revisions ORDER BY id',
  blocks: 'SELECT id,page_id,tree_position,content_json FROM page_blocks ORDER BY id',
  threads: 'SELECT id,page_id,block_id,anchor_json,anchor_revision_id FROM comment_threads ORDER BY id',
  comments: 'SELECT id,thread_id,parent_comment_id,author_member_id FROM comments ORDER BY id',
  pageGrants: 'SELECT id,page_id,principal_kind,principal_id,level,expires_at,revoked_at FROM page_grants ORDER BY id',
  containerGrants: 'SELECT id,container_id,principal_kind,principal_id,level FROM container_grants ORDER BY id',
  groups: 'SELECT g.id,g.name,m.member_id FROM groups g LEFT JOIN group_members m ON m.group_id=g.id ORDER BY g.id,m.member_id',
  files: 'SELECT id,page_id,original_name,size_bytes FROM files ORDER BY id',
  exposures: 'SELECT id,page_id,slug,revoked_at FROM public_exposures ORDER BY id',
  members: 'SELECT id,email,role,member_kind,status,is_setup_owner FROM members ORDER BY id',
  invitations: 'SELECT id,email,accepted_by_member_id,revoked_at FROM invitations ORDER BY id',
  sessions: 'SELECT COUNT(*) AS n FROM sessions',
};
