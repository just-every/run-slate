import { test, expect, afterEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { fixture, answer, transport, binding } from "./support";
import {
  askInquiry,
  materializeInquiry,
} from "../../../../src/core/features/inquiries/planner";
import { inquiryView } from "../../../../src/core/features/inquiries/service";
import { stopInquiry } from "../../../../src/core/features/inquiries/control";
import { consumeIntelligenceJob } from "../../../../src/core/features/runs/worker";
import { requireRun } from "../../../../src/core/features/runs/repository";
afterEach(() => vi.unstubAllGlobals());
test("INQ-001 — partially admitted rival branches retain interim findings, unavailable reasons and replayed durable stop", async () => {
  const f = await fixture();
  await env.DB.prepare(
    "UPDATE workspaces SET ai_monthly_budget_micros=220000 WHERE id=?",
  )
    .bind(f.workspaceId)
    .run();
  const started = await askInquiry(
    f.context(),
    { ...f.ask, audience: [f.owner] },
    { apiKey: "test-only" },
  );
  const calls = transport({
    ...answer,
    researchPlan: {
      hypotheses: [
        {
          statement: "Fields changed",
          disconfirmation: "Original fields match",
          investigationQuestion: "Check fields",
        },
        {
          statement: "Handoff changed",
          disconfirmation: "Original handoff matches",
          investigationQuestion: "Check handoff",
        },
        {
          statement: "Population changed",
          disconfirmation: "Original population matches",
          investigationQuestion: "Check population",
        },
      ],
      interimFinding: "Uncertainty remains; inspect the original records next.",
      analyses: [],
      trialProposalJson: null,
    },
  });
  await consumeIntelligenceJob(binding(), {
    kind: "intelligence.run",
    workspaceId: f.workspaceId,
    runId: started.value.id,
  });
  expect(calls()).toBe(1);
  const parent = await requireRun(f.context(), started.value.id);
  expect(parent.status).toBe("completed");
  const inquiryId = JSON.parse(parent.output_json!).inquiryId;
  let view = await inquiryView(f.context(), inquiryId);
  expect(view.hypotheses).toHaveLength(3);
  const admitted = view.hypotheses.filter((h) => h.run_id),
    denied = view.hypotheses.filter((h) => !h.run_id);
  expect(admitted).toHaveLength(2);
  expect(denied).toHaveLength(1);
  const reserved = await env.DB.prepare(
    "SELECT reserved_micros,released_at FROM intelligence_budgets WHERE workspace_id=? AND released_at IS NULL",
  )
    .bind(f.workspaceId)
    .all<{ reserved_micros: number; released_at: string | null }>();
  expect(reserved.results).toHaveLength(2);
  expect(
    reserved.results.reduce((n, r) => n + r.reserved_micros, 0),
  ).toBeLessThanOrEqual(220000);
  const partial = await materializeInquiry(f.context(), parent.id, {
    apiKey: "test-only",
  });
  expect(partial.branches.filter((b) => "state" in b)).toEqual([
    {
      hypothesisId: denied[0]!.id,
      state: "unavailable",
      reason: "REVISION_CONFLICT",
    },
  ]);
  transport({
    ...answer,
    hypothesisAssessment: {
      status: "disconfirmed",
      conclusion:
        "The original field matches; this rival is falsified within these records.",
      evidenceIds: ["E1"],
    },
  });
  await consumeIntelligenceJob(binding(), {
    kind: "intelligence.run",
    workspaceId: f.workspaceId,
    runId: String(admitted[0]!.run_id),
  });
  view = await inquiryView(f.context(), inquiryId);
  expect(view.artifacts).toHaveLength(1);
  expect(view.hypotheses.find((h) => h.id === admitted[0]!.id)!.status).toBe(
    "disconfirmed",
  );
  const input = {
    operationKey: "stop-partial-inquiry",
    expectedRevisionId: view.revisionId,
    reason: "Stop at bounded uncertainty",
  };
  await expect(
    stopInquiry(f.context(), inquiryId, {
      ...input,
      operationKey: "stale-stop-inquiry",
      expectedRevisionId: parent.revision_id,
    }),
  ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  const stopped = await stopInquiry(f.context(), inquiryId, input);
  expect(await stopInquiry(f.context(), inquiryId, input)).toEqual(stopped);
  expect(
    (await requireRun(f.context(), String(admitted[1]!.run_id))).status,
  ).toBe("cancelled");
  expect(
    (await requireRun(f.context(), String(admitted[0]!.run_id))).status,
  ).toBe("completed");
  view = await inquiryView(f.context(), inquiryId);
  expect(view.interimFinding).toMatchObject({ stopped: true });
  expect(view.artifacts).toHaveLength(1);
  expect(
    await env.DB.prepare(
      "SELECT count(*) n FROM intelligence_budgets WHERE workspace_id=? AND released_at IS NULL",
    )
      .bind(f.workspaceId)
      .first<number>("n"),
  ).toBe(0);
  console.info(
    "U5_NATIVE_INQ001",
    JSON.stringify({
      parentId: parent.id,
      parentStatus: parent.status,
      inquiryId,
      branches: partial.branches,
      reservations: reserved.results,
      stopReceipt: stopped.receipt,
      hypotheses: view.hypotheses,
      artifacts: view.artifacts,
    }),
  );
  // A fresh view must retain why the independent branch was unavailable, rather than silently an open rival with no run.
  expect(view.hypotheses.find((h) => h.id === denied[0]!.id)).toMatchObject({
    state: "unavailable",
    reason: "REVISION_CONFLICT",
  });
});
