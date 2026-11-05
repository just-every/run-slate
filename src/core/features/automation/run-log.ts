import type { FeatureContext } from "../../app/feature-context";
import { ApiProblem } from "../../app/problems";
import { navigationPageReads } from "../navigation/list-reads";
import { currentSubject } from "../sharing/current-access";
import type { RuleRow } from "./types";

type RunRow = {
  id: string;
  rule_id: string;
  workspace_id: string;
  actor_member_id: string | null;
  state: string;
  trigger_json: string;
  records_json: string;
  detail_json: string;
  parent_run_id: string | null;
  chain_depth: number;
  queued_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};
type ReceiptRow = {
  runId: string;
  actionIndex: number;
  targetId: string;
  state: string;
  receipt: string;
};

/** The caller authorizes the rule and its delegated definition before reading history. */
export async function readRunHistory(ctx: FeatureContext, rule: RuleRow) {
  const rows = (await ctx.db.prepare(
    `SELECT r.*,m.display_name AS actorName FROM automation_runs r
     LEFT JOIN members m ON m.id=r.actor_member_id AND m.workspace_id=r.workspace_id
     WHERE r.rule_id=? AND r.workspace_id=? ORDER BY r.created_at DESC,r.id DESC LIMIT 100`,
  ).bind(rule.id, ctx.actor.workspaceId).all<RunRow & {actorName: string | null}>()).results;
  const runs = rows.map(({actorName, ...row}) => ({
    row, actorName,
    recordIds: JSON.parse(row.records_json) as string[],
    trigger: JSON.parse(row.trigger_json),
  }));
  // History hydration uses four D1 reads total (rows + subject + ACL + titles),
  // plus one receipt read for the actor, independent of run/record count. This
  // leaves >90% of the paid 1,000-request budget for native HTTP authorization.
  const pages = await navigationPageReads(ctx, runs.flatMap(run => [
    ...run.recordIds, ...(run.trigger.pageId ? [run.trigger.pageId] : []),
  ]), await currentSubject(ctx));
  const receiptsByRun = new Map<string, ReceiptRow[]>();
  if (rule.actor_member_id === ctx.actor.id && rows.length) {
    const receipts = await ctx.db.prepare(
      `SELECT run_id AS runId,action_index AS actionIndex,target_id AS targetId,state,receipt_json AS receipt
       FROM automation_action_receipts WHERE run_id IN (SELECT value FROM json_each(?))
       ORDER BY action_index,target_id`,
    ).bind(JSON.stringify(rows.map(row => row.id))).all<ReceiptRow>();
    for (const receipt of receipts.results) {
      const list = receiptsByRun.get(receipt.runId) ?? [];
      list.push(receipt);
      receiptsByRun.set(receipt.runId, list);
    }
  }
  const items = runs.map(({row, actorName, recordIds, trigger}) => {
    const records: {id: string; title: string}[] = [];
    for (const id of recordIds) {
      try { records.push({id, title: pages.title(id)}); }
      catch (error) {
        if (!(error instanceof ApiProblem) || error.status !== 404) throw error;
      }
    }
    const readable = new Set(records.map(record => record.id));
    if (trigger.pageId && !pages.canRead(trigger.pageId)) {
      delete trigger.pageId;
      delete trigger.databaseId;
      delete trigger.containerId;
    }
    const receipts = (receiptsByRun.get(row.id) ?? [])
      .filter(receipt => !receipt.targetId || readable.has(receipt.targetId))
      .map(({runId, ...receipt}) => ({...receipt, receipt: JSON.parse(receipt.receipt)}));
    const detail = JSON.parse(row.detail_json);
    return {
      ...row,
      reason: typeof detail.reason === "string" ? detail.reason : undefined,
      actor: {id: row.actor_member_id, name: actorName ?? "Former member"},
      trigger,
      records,
      detail,
      records_json: JSON.stringify(records.map(record => record.id)),
      trigger_json: JSON.stringify(trigger),
      receipts,
    };
  });
  return {items};
}
