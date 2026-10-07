import { env } from "cloudflare:test";
import { afterEach, beforeEach, expect, test } from "vitest";
import { readRevision } from "../../../../src/core/features/versions/service";
import { sessionFor } from "../../../e2e/setup/fixtures";
import {
  beginSuggestionsTest,
  createPublishedPage,
  endSuggestionsTest,
  featureContext,
  grantCommentAccess,
  operationKey,
  request,
  sha256,
  suggestionsFixture,
} from "./fixture";

beforeEach(beginSuggestionsTest);
afterEach(endSuggestionsTest);

test("SUG-001 — a proposal stays on its published revision and current access controls its read", async () => {
  const fixture = await suggestionsFixture();
  const originalText = `release-original-${crypto.randomUUID()}`;
  const proposedText = `release-proposed-${crypto.randomUUID()}`;
  const { pageId, revisionId, blockId, slug } = await createPublishedPage(
    fixture,
    "Suggestion anchor boundary",
    originalText,
  );
  const grantId = await grantCommentAccess(fixture, pageId);

  const beforePage = await request(fixture, "GET", `/api/pages/${pageId}`, fixture.ownerCookie);
  expect(beforePage.response.status).toBe(200);
  expect(beforePage.data.workingRevisionId).toBe(revisionId);
  expect(beforePage.data.blocks[0].content.text[0].text).toBe(originalText);
  const originalForCommenter = await readRevision(
    featureContext(fixture, "reader"),
    pageId,
    revisionId,
  );
  expect(originalForCommenter).toMatchObject({
    id: revisionId,
    blocks: beforePage.data.blocks,
  });

  const beforePublic = await request(fixture, "GET", `/p/${slug}`);
  expect(beforePublic.response.status).toBe(200);
  expect(new TextDecoder().decode(beforePublic.bytes)).toContain(originalText);

  const proposedBlock = {
    id: blockId,
    blockType: "paragraph",
    parentBlockId: null,
    treePosition: "0001",
    content: { text: [{ text: proposedText }] },
  };
  const proposed = await request(
    fixture,
    "POST",
    `/api/suggestions/page/${pageId}`,
    fixture.readerCookie,
    {
      operationKey: operationKey("propose"),
      expectedRevisionId: revisionId,
      blocks: [proposedBlock],
    },
  );
  expect(proposed.response.status, JSON.stringify(proposed.data)).toBe(200);
  const suggestionId = proposed.data.value.id as string;

  const persisted = await env.DB.prepare(
    "SELECT id,page_id,revision_id,proposed_by_member_id,patch_json,state,created_at,decided_by_member_id,decided_at FROM content_suggestions WHERE id=?",
  ).bind(suggestionId).first<Record<string, unknown>>();
  expect(persisted).toMatchObject({
    id: suggestionId,
    page_id: pageId,
    revision_id: revisionId,
    proposed_by_member_id: fixture.readerId,
    state: "pending",
    decided_by_member_id: null,
    decided_at: null,
  });
  expect(typeof persisted?.created_at).toBe("string");
  expect(Number.isNaN(Date.parse(String(persisted?.created_at)))).toBe(false);
  expect(JSON.parse(String(persisted?.patch_json))).toEqual([proposedBlock]);

  const suggestionRead = await request(
    fixture,
    "GET",
    `/api/suggestions/page/${pageId}`,
    fixture.readerCookie,
  );
  expect(suggestionRead.response.status).toBe(200);
  expect(suggestionRead.data.items).toHaveLength(1);
  expect(suggestionRead.data.items[0]).toMatchObject({
    id: suggestionId,
    page_id: pageId,
    revision_id: revisionId,
    proposed_by_member_id: fixture.readerId,
    state: "pending",
    created_at: persisted?.created_at,
    patch_json: persisted?.patch_json,
  });
  expect(JSON.parse(suggestionRead.data.items[0].patch_json)[0].content.text[0].text).toBe(proposedText);

  const afterPage = await request(fixture, "GET", `/api/pages/${pageId}`, fixture.ownerCookie);
  expect(afterPage.data.blocks).toEqual(beforePage.data.blocks);
  expect(afterPage.data.page.revisionId).toBe(beforePage.data.page.revisionId);
  expect(afterPage.data.workingRevisionId).toBe(beforePage.data.workingRevisionId);
  expect(afterPage.data.publishedRevisionId).toBe(beforePage.data.publishedRevisionId);
  const originalAfterProposal = await readRevision(
    featureContext(fixture, "reader"),
    pageId,
    revisionId,
  );
  expect(originalAfterProposal).toEqual(originalForCommenter);
  const afterPublic = await request(fixture, "GET", `/p/${slug}`);
  expect(afterPublic.response.status).toBe(200);
  expect(afterPublic.bytes).toEqual(beforePublic.bytes);
  expect(new TextDecoder().decode(afterPublic.bytes)).not.toContain(proposedText);

  const revoked = await request(fixture, "POST", "/api/sharing", fixture.ownerCookie, {
    operationKey: operationKey("revoke-comment"),
    targetKind: "page",
    targetId: pageId,
    id: grantId,
    principalKind: "member",
    principalId: fixture.readerId,
    level: "comment",
    revoke: true,
  });
  expect(revoked.response.status, JSON.stringify(revoked.data)).toBe(200);

  const freshReaderCookie = await sessionFor(fixture.readerId);
  const denied = await request(
    fixture,
    "GET",
    `/api/suggestions/page/${pageId}`,
    freshReaderCookie,
  );
  expect(denied.response.status).toBe(404);
  const denial = new TextDecoder().decode(denied.bytes);
  expect(denial).not.toContain(originalText);
  expect(denial).not.toContain(proposedText);
  expect(denial).not.toContain(String(persisted?.patch_json));
  console.log("SUG-001 observed boundary", JSON.stringify({
    pageId,
    revisionId,
    suggestion: {
      id: suggestionId,
      authorMemberId: persisted?.proposed_by_member_id,
      createdAt: persisted?.created_at,
      patch: JSON.parse(String(persisted?.patch_json)),
    },
    before: {
      workingRevisionId: beforePage.data.workingRevisionId,
      publishedRevisionId: beforePage.data.publishedRevisionId,
      blocks: beforePage.data.blocks,
      publicStatus: beforePublic.response.status,
      publicByteLength: beforePublic.bytes.length,
      publicSha256: await sha256(beforePublic.bytes),
    },
    afterProposal: {
      workingRevisionId: afterPage.data.workingRevisionId,
      publishedRevisionId: afterPage.data.publishedRevisionId,
      blocks: afterPage.data.blocks,
      publicStatus: afterPublic.response.status,
      publicByteLength: afterPublic.bytes.length,
      publicSha256: await sha256(afterPublic.bytes),
    },
    revokedRead: {
      status: denied.response.status,
      containsOriginal: denial.includes(originalText),
      containsProposal: denial.includes(proposedText),
      containsPatch: denial.includes(String(persisted?.patch_json)),
    },
  }));
  expect(fixture.providerCalls()).toBe(0);
});
