import { archivePage } from "../archive/service";
import { sendNotification } from "../notifications/commands";
import type { AutomationAdapters } from "./actions";
export const automationAdapters: AutomationAdapters = {
  archive: (ctx, id, input) =>
    archivePage(ctx, id, { ...input, action: "archive" }),
  notify: (ctx, input) =>
    sendNotification(ctx, {
      operationKey: input.operationKey,
      pageId: input.sourcePageId,
      recipientIds: input.recipientMemberIds,
      outcome: input.message,
      channel: "inbox",
    }),
};
