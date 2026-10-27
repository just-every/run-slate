import { SELF, env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";
import { resetDeployment } from "./reset-deployment";
import {
  seedBlock,
  seedContainer,
  seedContainerGrant,
  seedContainerMember,
  seedGroup,
  seedMember,
  seedPage,
  seedPageGrant,
  seedWorkspace,
  sessionFor,
} from "./fixtures";

beforeEach(resetDeployment);

/**
 * The fixtures' own proof. These are harness self-tests, not clause journeys:
 * they carry no contract ID because they assert nothing about the product, only
 * that what `fixtures.ts` writes is the same state a real request and the real
 * schema accept. `scripts/verify.mjs` excludes this directory from clause
 * mapping for exactly that reason — a failure here still fails the suite.
 */

test("deployment ownership fixtures retain authenticated identity, page foreign keys, membership and grants", async () => {
  const workspace = await seedWorkspace({ name: "Aurora Labs" });
  // Each step retains its original fixture assertions and failure context.
  const cases = [
    { name: "a seeded member's session authenticates at /api/session", run: async () => {
  const { workspaceId } = workspace;
  const { memberId } = await seedMember(workspaceId, {
    role: "owner",
    email: "rae@aurora.test",
    displayName: "Rae Mensah",
  });
  const cookie = await sessionFor(memberId);

  const response = await SELF.fetch("https://slate.test/api/session", { headers: { cookie } });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    member: {
      id: memberId,
      workspaceId,
      workspaceName: "Aurora Labs",
      email: "rae@aurora.test",
      displayName: "Rae Mensah",
      initials: "RM",
      role: "owner",
    },
  });
} },
    { name: "a seeded page's foreign keys resolve to its workspace, container, author and parent", run: async () => {
  const { workspaceId } = workspace;
  const { memberId: authorId } = await seedMember(workspaceId, { role: "owner", email: "kit@aurora.test", displayName: "Kit Ogun" });
  const { containerId } = await seedContainer(workspaceId, { ownerMemberId: authorId, visibility: "open", name: "Handbook" });
  const parent = await seedPage(containerId, { title: "Onboarding", authorMemberId: authorId });
  const child = await seedPage(containerId, { title: "Day one", authorMemberId: authorId, parentPageId: parent.pageId, lifecycle: "draft" });

  expect(child.workspaceId).toBe(workspaceId);

  const row = await env.DB.prepare(
    `SELECT p.title AS title, p.lifecycle AS lifecycle, p.parent_page_id AS parent_page_id,
            w.id AS workspace_id, c.id AS container_id, m.email AS author_email
       FROM pages p
       JOIN workspaces w ON w.id = p.workspace_id
       JOIN containers c ON c.id = p.container_id
       JOIN members m ON m.id = p.author_member_id
      WHERE p.id = ?`,
  )
    .bind(child.pageId)
    .first<{ title: string; lifecycle: string; parent_page_id: string; workspace_id: string; container_id: string; author_email: string }>();

  expect(row).toEqual({
    title: "Day one",
    lifecycle: "draft",
    parent_page_id: parent.pageId,
    workspace_id: workspaceId,
    container_id: containerId,
    author_email: "kit@aurora.test",
  });

  // The schema, not the fixture, is the authority on what a page may reference.
  await expect(seedPage(createMissingContainerId(), { title: "Orphan", authorMemberId: authorId })).rejects.toThrow(/No container/);
} },
    { name: "groups, container membership, blocks and grants land on their owners", run: async () => {
  const { workspaceId } = workspace;
  const { memberId: ownerId } = await seedMember(workspaceId, { role: "owner", email: "owner@aurora.test", displayName: "Ada Owner" });
  const { memberId: readerId } = await seedMember(workspaceId, { role: "member", email: "reader@aurora.test", displayName: "Ben Reader" });
  const { groupId } = await seedGroup(workspaceId, { name: "Editors", memberIds: [ownerId, readerId] });
  const { containerId } = await seedContainer(workspaceId, { ownerMemberId: ownerId, visibility: "personal", personal: true });
  await seedContainerMember(containerId, readerId);
  const { pageId } = await seedPage(containerId, { title: "Runbook", authorMemberId: ownerId });
  const { blockId } = await seedBlock(pageId, { type: "paragraph", content: { text: "Rotate the key." } });
  const { grantId: pageGrantId } = await seedPageGrant(pageId, { principalKind: "group", principalId: groupId, level: "edit" });
  const { grantId: containerGrantId } = await seedContainerGrant(containerId, { principalKind: "workspace", principalId: workspaceId, level: "view" });

  const counts = await env.DB.prepare(
    `SELECT (SELECT count(*) FROM group_members WHERE group_id = ?) AS group_members,
            (SELECT count(*) FROM container_members WHERE container_id = ?) AS container_members,
            (SELECT count(*) FROM container_owners WHERE container_id = ? AND member_id = ?) AS owners`,
  )
    .bind(groupId, containerId, containerId, ownerId)
    .first<{ group_members: number; container_members: number; owners: number }>();
  expect(counts).toEqual({ group_members: 2, container_members: 2, owners: 1 });

  const block = await env.DB.prepare("SELECT page_id, block_type, content_json FROM page_blocks WHERE id = ?")
    .bind(blockId)
    .first<{ page_id: string; block_type: string; content_json: string }>();
  expect(block).toEqual({ page_id: pageId, block_type: "paragraph", content_json: JSON.stringify({ text: "Rotate the key." }) });

  const grants = await env.DB.prepare(
    `SELECT (SELECT principal_id FROM page_grants WHERE id = ?) AS page_principal,
            (SELECT principal_id FROM container_grants WHERE id = ?) AS container_principal`,
  )
    .bind(pageGrantId, containerGrantId)
    .first<{ page_principal: string; container_principal: string }>();
  expect(grants).toEqual({ page_principal: groupId, container_principal: workspaceId });

  // A personal container is a visibility, so a contradictory fixture is refused.
  await expect(seedContainer(workspaceId, { ownerMemberId: ownerId, visibility: "open", personal: true })).rejects.toThrow(/personal/);
} }
  ];
  for (const scenario of cases) {
    try { await scenario.run(); }
    catch (cause) { throw new Error(`Case ${scenario.name} failed`, { cause }); }
  }
});

test("deployment session fixtures retain hashed tokens, expiry and revocation", async () => {
  const workspace = await seedWorkspace({ name: "Aurora Labs" });
  // Each step retains its original fixture assertions and failure context.
  const cases = [
    { name: "sessionFor stores only the hashed token, so expiry and revocation are real", run: async () => {
  const { workspaceId } = workspace;
  const { memberId } = await seedMember(workspaceId, { role: "member", email: "dev@aurora.test", displayName: "Devi Rao" });

  const expired = await sessionFor(memberId, { expiresAt: new Date(Date.now() - 60_000).toISOString() });
  const revoked = await sessionFor(memberId, { revokedAt: new Date().toISOString() });
  const valid = await sessionFor(memberId);

  expect((await SELF.fetch("https://slate.test/api/session", { headers: { cookie: expired } })).status).toBe(401);
  expect((await SELF.fetch("https://slate.test/api/session", { headers: { cookie: revoked } })).status).toBe(401);
  expect((await SELF.fetch("https://slate.test/api/session", { headers: { cookie: valid } })).status).toBe(200);

  // The token in the cookie is never a stored value: only its digest is.
  const token = valid.split("=")[1]!;
  const stored = await env.DB.prepare("SELECT count(*) AS total FROM sessions WHERE token_digest = ?")
    .bind(token)
    .first<{ total: number }>();
  expect(stored?.total).toBe(0);
} }
  ];
  for (const scenario of cases) {
    try { await scenario.run(); }
    catch (cause) { throw new Error(`Case ${scenario.name} failed`, { cause }); }
  }
});









/** A well-formed ULID no container was ever seeded with. */
function createMissingContainerId(): string {
  return "00000000000000000000000000";
}
