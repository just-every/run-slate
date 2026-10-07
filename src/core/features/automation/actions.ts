import { ApiProblem } from "../../app/problems";
import type { FeatureContext } from "../../app/feature-context";
import type { JsonValue } from "../../shared/api/common";
import { readPage, createPage } from "../pages/service";
import { previewMove, movePage } from "../pages/tree";
import { createComment } from "../comments/service";
import { createRecord } from "../databases/service";
import { updateRecord } from "../databases/records";
import type { RuleAction } from "./types";
export interface AutomationAdapters {
  archive: (
    ctx: FeatureContext,
    pageId: string,
    input: {
      operationKey: string;
      expectedRevisionId: string;
      reason?: string;
    },
  ) => Promise<unknown>;
  notify: (
    ctx: FeatureContext,
    input: {
      operationKey: string;
      sourcePageId: string;
      recipientMemberIds: string[];
      message: string;
    },
  ) => Promise<unknown>;
}
export interface PreparedAction {
  action: RuleAction;
  pageId: string;
  operationKey: string;
  expectedRevisionId?: string;
  accessPreviewHash?: string;
  treePosition?: string;
}
export async function prepareAction(
  ctx: FeatureContext,
  action: RuleAction,
  pageId: string,
  operationKey: string,
): Promise<PreparedAction> {
  const p = pageId ? await readPage(ctx, pageId) : null;
  const prepared: PreparedAction = {
    action,
    pageId,
    operationKey,
    expectedRevisionId: p?.page.revisionId,
  };
  if (action.type === "move") {
    const preview = await previewMove(ctx, pageId, action);
    prepared.accessPreviewHash = preview.accessPreviewHash;
    prepared.treePosition = `${ctx.now}:${pageId}`;
  }
  return prepared;
}
export async function executeAction(
  ctx: FeatureContext,
  p: PreparedAction,
  adapters: AutomationAdapters,
) {
  const a = p.action;
  switch (a.type) {
    case "edit-fields":
      return updateRecord(ctx, p.pageId, {
        operationKey: p.operationKey,
        expectedRevisionId: p.expectedRevisionId!,
        values: a.values,
      });
    case "create-page":
      return createPage(ctx, {
        operationKey: p.operationKey,
        containerId: a.containerId,
        parentPageId: a.parentPageId,
        title: a.title,
      });
    case "create-record":
      return createRecord(ctx, a.databaseId, {
        operationKey: p.operationKey,
        title: a.title,
        values: a.values,
      });
    case "move":
      return movePage(ctx, p.pageId, {
        operationKey: p.operationKey,
        expectedRevisionId: p.expectedRevisionId!,
        containerId: a.containerId,
        parentPageId: a.parentPageId,
        treePosition: p.treePosition!,
        accessPreviewHash: p.accessPreviewHash!,
      });
    case "archive":
      return adapters.archive(ctx, p.pageId, {
        operationKey: p.operationKey,
        expectedRevisionId: p.expectedRevisionId!,
        reason: a.reason,
      });
    case "comment":
      return createComment(ctx, p.pageId, {
        operationKey: p.operationKey,
        body: (typeof a.body === "string"
          ? [{ text: a.body }]
          : a.body) as JsonValue,
      });
    case "notify":
      return adapters.notify(ctx, {
        operationKey: p.operationKey,
        sourcePageId: p.pageId,
        recipientMemberIds: a.recipientMemberIds,
        message: a.message,
      });
    default:
      throw new ApiProblem(
        400,
        "FORBIDDEN_AUTOMATION_ACTION",
        "Automation cannot execute this action.",
      );
  }
}
