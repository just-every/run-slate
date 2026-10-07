import { env } from "cloudflare:test";
import { afterEach, beforeEach, expect, test } from "vitest";
import { decodeArchive } from "../../../../src/core/features/portability/archive";
import { exportWorkspace, restoreWorkspace } from "../../../../src/core/features/portability/service";
import { readPage } from "../../../../src/core/features/pages/service";
import { readRevision } from "../../../../src/core/features/versions/service";
import type { FeatureContext } from "../../../../src/core/app/feature-context";
import { seedMember, seedWorkspace, sessionFor } from "../../../e2e/setup/fixtures";
import {
  beginSuggestionsTest,
  clearProductDatabase,
  createPublishedPage,
  endSuggestionsTest,
  featureContext,
  grantCommentAccess,
  operationKey,
  request,
  retainFile,
  snapshotCounts,
  snapshotSuggestionMutation,
  suggestionsFixture,
} from "./fixture";

beforeEach(beginSuggestionsTest);
afterEach(endSuggestionsTest);

test("SUG-002 — native acceptance is atomic and replayable; rejection history survives an empty migrated restore", async () => {
  const fixture = await suggestionsFixture();
  const originalText = `release-original-${crypto.randomUUID()}`;
  const acceptedText = `release-accepted-${crypto.randomUUID()}`;
  const { pageId, revisionId, blockId, slug } = await createPublishedPage(
    fixture,
    "Suggestion resolution boundary",
    originalText,
  );
  await grantCommentAccess(fixture, pageId);
  const acceptedBlock = {
    id: blockId,
    blockType: "paragraph",
    parentBlockId: null,
    treePosition: "0001",
    content: { text: [{ text: acceptedText }] },
  };
  const proposed = await request(
    fixture,
    "POST",
    `/api/suggestions/page/${pageId}`,
    fixture.readerCookie,
    {
      operationKey: operationKey("accept-proposal"),
      expectedRevisionId: revisionId,
      blocks: [acceptedBlock],
    },
  );
  expect(proposed.response.status, JSON.stringify(proposed.data)).toBe(200);
  const acceptedSuggestionId = proposed.data.value.id as string;
  const acceptKey = operationKey("atomic-accept");
  const acceptBody = { operationKey: acceptKey, accept: true };
  const originalRevision = await readRevision(featureContext(fixture), pageId, revisionId);
  expect(originalRevision).toMatchObject({
    id: revisionId,
    blocks: [{ id: blockId, content: { text: [{ text: originalText }] } }],
  });
  const beforeFault = await snapshotSuggestionMutation(fixture, pageId);

  await env.DB.prepare(
    `CREATE TRIGGER release_abort_suggestion_revision BEFORE INSERT ON page_revisions
     WHEN NEW.page_id='${pageId}' BEGIN SELECT RAISE(ABORT,'release injected suggestion write fault'); END`,
  ).run();
  let faultResponse: { response: Response; data: any } | undefined;
  try {
    faultResponse = await request(
      fixture,
      "POST",
      `/api/suggestions/${acceptedSuggestionId}/decide`,
      fixture.ownerCookie,
      acceptBody,
    );
  } finally {
    await env.DB.prepare("DROP TRIGGER IF EXISTS release_abort_suggestion_revision").run();
  }
  const afterFault = await snapshotSuggestionMutation(fixture, pageId);
  console.log("SUG-002 injected D1 abort effects", JSON.stringify({
    status: faultResponse?.response.status,
    beforeCounts: snapshotCounts(beforeFault),
    afterCounts: snapshotCounts(afterFault),
    before: beforeFault,
    after: afterFault,
  }));
  expect(faultResponse?.response.status).toBe(500);
  expect(afterFault).toEqual(beforeFault);
  expect(fixture.providerCalls()).toBe(0);

  const accepted = await request(
    fixture,
    "POST",
    `/api/suggestions/${acceptedSuggestionId}/decide`,
    fixture.ownerCookie,
    acceptBody,
  );
  expect(accepted.response.status, JSON.stringify(accepted.data)).toBe(200);
  expect(accepted.data.value).toMatchObject({ id: acceptedSuggestionId, state: "accepted" });
  const replay = await request(
    fixture,
    "POST",
    `/api/suggestions/${acceptedSuggestionId}/decide`,
    fixture.ownerCookie,
    acceptBody,
  );
  expect(replay.response.status).toBe(200);
  expect(replay.data).toEqual(accepted.data);
  const acceptReceiptCount = await env.DB.prepare(
    "SELECT count(*) AS n FROM operation_receipts WHERE workspace_id=? AND operation_key=?",
  ).bind(fixture.workspaceId, acceptKey).first<number>("n");
  const acceptActivityCount = await env.DB.prepare(
    "SELECT count(*) AS n FROM activity_entries WHERE workspace_id=? AND operation_key=?",
  ).bind(fixture.workspaceId, acceptKey).first<number>("n");
  expect(acceptReceiptCount).toBe(1);
  expect(acceptActivityCount).toBe(1);
  const afterAccept = await snapshotSuggestionMutation(fixture, pageId);
  expect((afterAccept.revisions as unknown[]).length).toBe((beforeFault.revisions as unknown[]).length + 1);
  expect((afterAccept.contentEvents as unknown[]).length).toBe((beforeFault.contentEvents as unknown[]).length + 1);
  const acceptedRow = await env.DB.prepare(
    "SELECT state,decided_by_member_id,decided_at FROM content_suggestions WHERE id=?",
  ).bind(acceptedSuggestionId).first<Record<string, unknown>>();
  expect(acceptedRow?.state).toBe("accepted");
  expect(acceptedRow?.decided_by_member_id).toBe(fixture.ownerId);
  expect(Number.isNaN(Date.parse(String(acceptedRow?.decided_at)))).toBe(false);
  const currentPage = await readPage(featureContext(fixture), pageId);
  expect(currentPage.blocks[0]?.content).toEqual(acceptedBlock.content);
  expect(currentPage.workingRevisionId).toBe(accepted.data.receipt.revisionId);
  expect(await readRevision(featureContext(fixture), pageId, revisionId)).toMatchObject({
    id: originalRevision.id,
    properties: originalRevision.properties,
    blocks: originalRevision.blocks,
    createdAt: originalRevision.createdAt,
    newerRevisionExists: true,
  });
  expect((await request(fixture, "GET", `/p/${slug}`)).data).toContain(acceptedText);
  console.log("SUG-002 acceptance and replay effects", JSON.stringify({
    firstStatus: accepted.response.status,
    replayStatus: replay.response.status,
    replayMatchesFirst: JSON.stringify(replay.data) === JSON.stringify(accepted.data),
    operationReceiptCount: acceptReceiptCount,
    activityCount: acceptActivityCount,
    revisionCountBefore: snapshotCounts(beforeFault).revisions,
    revisionCountAfter: snapshotCounts(afterAccept).revisions,
    contentEventCountBefore: snapshotCounts(beforeFault).contentEvents,
    contentEventCountAfter: snapshotCounts(afterAccept).contentEvents,
    acceptedSuggestion: acceptedRow,
    workingRevisionId: currentPage.workingRevisionId,
    acceptedBlock: currentPage.blocks[0],
  }));

  const changedBodyReplay = await request(
    fixture,
    "POST",
    `/api/suggestions/${acceptedSuggestionId}/decide`,
    fixture.ownerCookie,
    { operationKey: acceptKey, accept: false },
  );
  expect(changedBodyReplay.response.status).toBe(409);
  expect(changedBodyReplay.data.code).toBe("OPERATION_KEY_CONFLICT");
  expect(await snapshotSuggestionMutation(fixture, pageId)).toEqual(afterAccept);

  const stalePage = await request(fixture, "GET", `/api/pages/${pageId}`, fixture.ownerCookie);
  const staleText = `release-stale-base-${crypto.randomUUID()}`;
  const staleSuggestion = await request(
    fixture,
    "POST",
    `/api/suggestions/page/${pageId}`,
    fixture.readerCookie,
    {
      operationKey: operationKey("stale-proposal"),
      expectedRevisionId: stalePage.data.workingRevisionId,
      blocks: [{ ...acceptedBlock, content: { text: [{ text: staleText }] } }],
    },
  );
  expect(staleSuggestion.response.status, JSON.stringify(staleSuggestion.data)).toBe(200);
  const staleSuggestionId = staleSuggestion.data.value.id as string;
  const advancedText = `release-advanced-${crypto.randomUUID()}`;
  const advancedPage = await request(
    fixture,
    "PUT",
    `/api/pages/${pageId}/blocks`,
    fixture.ownerCookie,
    {
      operationKey: operationKey("advance-page"),
      expectedRevisionId: stalePage.data.workingRevisionId,
      blocks: [{ ...acceptedBlock, content: { text: [{ text: advancedText }] } }],
    },
  );
  expect(advancedPage.response.status, JSON.stringify(advancedPage.data)).toBe(200);
  const beforeStaleAccept = await snapshotSuggestionMutation(fixture, pageId);
  const staleAcceptKey = operationKey("stale-accept");
  const staleAccept = await request(
    fixture,
    "POST",
    `/api/suggestions/${staleSuggestionId}/decide`,
    fixture.ownerCookie,
    { operationKey: staleAcceptKey, accept: true },
  );
  expect(staleAccept.response.status).toBe(409);
  expect(staleAccept.data.code).toBe("REVISION_CONFLICT");
  expect(await snapshotSuggestionMutation(fixture, pageId)).toEqual(beforeStaleAccept);

  const editorGrantId = await grantCommentAccess(fixture, pageId, fixture.editorId, "edit");
  const editorProposalText = `release-revoked-editor-${crypto.randomUUID()}`;
  const editorProposal = await request(
    fixture,
    "POST",
    `/api/suggestions/page/${pageId}`,
    fixture.editorCookie,
    {
      operationKey: operationKey("editor-proposal"),
      expectedRevisionId: advancedPage.data.value.revisionId,
      blocks: [{ ...acceptedBlock, content: { text: [{ text: editorProposalText }] } }],
    },
  );
  expect(editorProposal.response.status, JSON.stringify(editorProposal.data)).toBe(200);
  const editorSuggestionId = editorProposal.data.value.id as string;
  const editorRevoke = await request(fixture, "POST", "/api/sharing", fixture.ownerCookie, {
    operationKey: operationKey("revoke-editor"),
    targetKind: "page",
    targetId: pageId,
    id: editorGrantId,
    principalKind: "member",
    principalId: fixture.editorId,
    level: "edit",
    revoke: true,
  });
  expect(editorRevoke.response.status).toBe(200);
  const editorCookieAfterRevocation = await sessionFor(fixture.editorId);
  const beforeRevokedDecision = await snapshotSuggestionMutation(fixture, pageId);
  const revokedDecision = await request(
    fixture,
    "POST",
    `/api/suggestions/${editorSuggestionId}/decide`,
    editorCookieAfterRevocation,
    { operationKey: operationKey("revoked-editor-accept"), accept: true },
  );
  expect(revokedDecision.response.status).toBe(404);
  expect(new TextDecoder().decode(revokedDecision.bytes)).not.toContain(editorProposalText);
  expect(await snapshotSuggestionMutation(fixture, pageId)).toEqual(beforeRevokedDecision);

  const pageBeforeReject = await readPage(featureContext(fixture), pageId);
  const publicBeforeReject = await request(fixture, "GET", `/p/${slug}`);
  const rejectionText = `release-rejected-${crypto.randomUUID()}`;
  const rejectionProposal = await request(
    fixture,
    "POST",
    `/api/suggestions/page/${pageId}`,
    fixture.readerCookie,
    {
      operationKey: operationKey("rejection-proposal"),
      expectedRevisionId: pageBeforeReject.workingRevisionId,
      blocks: [{ ...acceptedBlock, content: { text: [{ text: rejectionText }] } }],
    },
  );
  expect(rejectionProposal.response.status).toBe(200);
  const rejectedSuggestionId = rejectionProposal.data.value.id as string;
  const pageAfterProposal = await readPage(featureContext(fixture), pageId);
  expect(pageAfterProposal.blocks).toEqual(pageBeforeReject.blocks);
  const publicAfterProposal = await request(fixture, "GET", `/p/${slug}`);
  expect(publicAfterProposal.bytes).toEqual(publicBeforeReject.bytes);

  const rejectKey = operationKey("reject");
  await grantCommentAccess(fixture, pageId, fixture.editorId, "edit");
  const editorRejectionCookie = await sessionFor(fixture.editorId);
  const rejected = await request(
    fixture,
    "POST",
    `/api/suggestions/${rejectedSuggestionId}/decide`,
    editorRejectionCookie,
    { operationKey: rejectKey, accept: false },
  );
  expect(rejected.response.status, JSON.stringify(rejected.data)).toBe(200);
  expect(rejected.data.value).toMatchObject({ id: rejectedSuggestionId, state: "rejected" });
  const rejectedRow = await env.DB.prepare(
    "SELECT id,page_id,revision_id,proposed_by_member_id,patch_json,state,created_at,decided_by_member_id,decided_at FROM content_suggestions WHERE id=?",
  ).bind(rejectedSuggestionId).first<Record<string, unknown>>();
  expect(rejectedRow).toMatchObject({
    id: rejectedSuggestionId,
    page_id: pageId,
    state: "rejected",
    proposed_by_member_id: fixture.readerId,
    decided_by_member_id: fixture.editorId,
  });
  expect(typeof rejectedRow?.created_at).toBe("string");
  expect(Number.isNaN(Date.parse(String(rejectedRow?.decided_at)))).toBe(false);
  expect(JSON.parse(String(rejectedRow?.patch_json))[0].content.text[0].text).toBe(rejectionText);
  const pageAfterReject = await readPage(featureContext(fixture), pageId);
  expect(pageAfterReject.blocks).toEqual(pageBeforeReject.blocks);
  expect(pageAfterReject.workingRevisionId).toBe(pageBeforeReject.workingRevisionId);
  expect(pageAfterReject.publishedRevisionId).toBe(pageBeforeReject.publishedRevisionId);
  expect((await request(fixture, "GET", `/p/${slug}`)).bytes).toEqual(publicBeforeReject.bytes);
  const rejectionReceipt = await env.DB.prepare(
    "SELECT actor_member_id,operation_key FROM operation_receipts WHERE workspace_id=? AND operation_key=?",
  ).bind(fixture.workspaceId, rejectKey).first<Record<string, unknown>>();
  expect(rejectionReceipt).toEqual({ actor_member_id: fixture.editorId, operation_key: rejectKey });
  const rejectionActivity = await env.DB.prepare(
    "SELECT actor_member_id,action,target_id,operation_key FROM activity_entries WHERE workspace_id=? AND operation_key=?",
  ).bind(fixture.workspaceId, rejectKey).first<Record<string, unknown>>();
  expect(rejectionActivity).toEqual({
    actor_member_id: fixture.editorId,
    action: "suggestions.decide",
    target_id: pageId,
    operation_key: rejectKey,
  });
  console.log("SUG-002 editor rejection effects", JSON.stringify({
    status: rejected.response.status,
    suggestion: rejectedRow,
    pageBefore: {
      workingRevisionId: pageBeforeReject.workingRevisionId,
      publishedRevisionId: pageBeforeReject.publishedRevisionId,
      blocks: pageBeforeReject.blocks,
    },
    pageAfter: {
      workingRevisionId: pageAfterReject.workingRevisionId,
      publishedRevisionId: pageAfterReject.publishedRevisionId,
      blocks: pageAfterReject.blocks,
    },
    anonymousBytesUnchanged: publicAfterProposal.bytes.length === publicBeforeReject.bytes.length
      && publicAfterProposal.bytes.every((byte, index) => byte === publicBeforeReject.bytes[index]),
    receipt: rejectionReceipt,
    activity: rejectionActivity,
  }));
  const historyBeforeExport = await request(
    fixture,
    "GET",
    `/api/suggestions/page/${pageId}`,
    fixture.ownerCookie,
  );
  expect(historyBeforeExport.response.status).toBe(200);
  expect(historyBeforeExport.data.items.find((item: any) => item.id === rejectedSuggestionId)).toMatchObject({
    state: "rejected",
    decided_by_member_id: fixture.editorId,
    decided_at: rejectedRow?.decided_at,
    patch_json: rejectedRow?.patch_json,
  });

  const exportResult = await exportWorkspace(featureContext(fixture), {
    operationKey: operationKey("history-export"),
  });
  expect(exportResult.state).toBe("completed");
  const exportRow = await env.DB.prepare(
    "SELECT archive_key FROM federation_exports WHERE id=?",
  ).bind(exportResult.id).first<{ archive_key: string }>();
  expect(exportRow?.archive_key).toBeTruthy();
  retainFile(exportRow!.archive_key);
  const archivedObject = await env.FILES.get(exportRow!.archive_key);
  expect(archivedObject).not.toBeNull();
  const archiveBytes = new Uint8Array(await archivedObject!.arrayBuffer());
  const archive = await decodeArchive(archiveBytes);
  const archivedSuggestion = archive.manifest.tables.content_suggestions?.find(
    (row) => row.id === rejectedSuggestionId,
  );
  expect(archivedSuggestion).toMatchObject({
    id: rejectedSuggestionId,
    page_id: pageId,
    revision_id: rejectedRow?.revision_id,
    state: "rejected",
    decided_by_member_id: fixture.editorId,
    decided_at: rejectedRow?.decided_at,
    patch_json: rejectedRow?.patch_json,
  });

  const migrationCountBeforeRestore = await env.DB.prepare(
    "SELECT count(*) AS n FROM d1_migrations",
  ).first<number>("n");
  await clearProductDatabase();
  const emptyTableCount = await env.DB.prepare(
    "SELECT count(*) AS n FROM content_suggestions",
  ).first<number>("n");
  expect(migrationCountBeforeRestore).toBeGreaterThan(0);
  expect(emptyTableCount).toBe(0);
  const { workspaceId: targetWorkspaceId } = await seedWorkspace({ name: "Empty migrated restore target" });
  const { memberId: targetOwnerId } = await seedMember(targetWorkspaceId, {
    email: "owner@slate.test",
    displayName: "Workspace Owner",
    role: "owner",
    isSetupOwner: true,
  });
  const restored = await restoreWorkspace(
    {
      db: env.DB,
      files: env.FILES,
      jobs: env.JOBS,
      now: new Date().toISOString(),
      actor: {
        id: targetOwnerId,
        workspaceId: targetWorkspaceId,
        workspaceName: "Empty migrated restore target",
        email: "owner@slate.test",
        displayName: "Workspace Owner",
        initials: "WO",
        role: "owner",
      },
    } as FeatureContext,
    archiveBytes,
  );
  expect(restored.state).toBe("completed");
  const restoredRow = await env.DB.prepare(
    "SELECT id,page_id,revision_id,proposed_by_member_id,patch_json,state,created_at,decided_by_member_id,decided_at FROM content_suggestions WHERE id=?",
  ).bind(rejectedSuggestionId).first<Record<string, unknown>>();
  expect(restoredRow).toMatchObject({
    id: rejectedSuggestionId,
    page_id: pageId,
    revision_id: rejectedRow?.revision_id,
    proposed_by_member_id: fixture.readerId,
    patch_json: rejectedRow?.patch_json,
    state: "rejected",
    created_at: rejectedRow?.created_at,
    decided_by_member_id: fixture.editorId,
    decided_at: rejectedRow?.decided_at,
  });
  const restoredOwner = await env.DB.prepare(
    "SELECT id,workspace_id FROM members WHERE email='owner@slate.test' AND status='active'",
  ).first<{ id: string; workspace_id: string }>();
  const restoredCookie = await sessionFor(restoredOwner!.id);
  const restoredApi = await request(
    fixture,
    "GET",
    `/api/suggestions/page/${pageId}`,
    restoredCookie,
  );
  expect(restoredApi.response.status).toBe(200);
  expect(restoredApi.data.items.find((item: any) => item.id === rejectedSuggestionId)).toMatchObject({
    state: "rejected",
    decided_by_member_id: fixture.editorId,
    decided_at: rejectedRow?.decided_at,
    patch_json: rejectedRow?.patch_json,
  });
  console.log("SUG-002 export and empty migrated restore", JSON.stringify({
    exportState: exportResult.state,
    archiveBytes: archiveBytes.length,
    archivedSuggestion,
    migrationCountBeforeRestore,
    emptySuggestionCountBeforeRestore: emptyTableCount,
    restoreState: restored.state,
    restoredSuggestion: restoredRow,
    restoredApiStatus: restoredApi.response.status,
    providerCalls: fixture.providerCalls(),
  }));

  expect(fixture.providerCalls()).toBe(0);
  const staleReject = await request(
    fixture,
    "POST",
    `/api/suggestions/${staleSuggestionId}/decide`,
    restoredCookie,
    { operationKey: operationKey("stale-reject"), accept: false },
  );
  console.log(
    "SUG-002 stale-rejection contract observation",
    JSON.stringify({ status: staleReject.response.status, body: staleReject.data }),
  );
  expect(staleReject.response.status).toBe(200);
  expect(staleReject.data.value).toMatchObject({ id: staleSuggestionId, state: "rejected" });
});
