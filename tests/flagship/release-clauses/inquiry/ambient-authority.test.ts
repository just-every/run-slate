import {resetDeployment} from '../../../e2e/setup/reset-deployment';
import { test, expect, afterEach, vi } from "vitest";
import { env } from "cloudflare:test";
import {
  fixture,
  answer,
  transport,
  binding,
  count,
  revokeReader,
} from "./support";
import {
  prepareAmbientScope,
  ambientView,
  auditSelected,
} from "../../../../src/core/features/inquiries/ambient";
import { scheduleAmbient } from "../../../../src/core/features/inquiries/ambient-scheduler";
import { consumeIntelligenceJob } from "../../../../src/core/features/runs/worker";
import { chooseRoute } from "../../../../src/core/features/ai/model-policy";
import { requestHash } from "../../../../src/core/app/operations";
afterEach(() => vi.unstubAllGlobals());
const assessment = {
  novelty: 0.1,
  contradiction: 0.1,
  impact: 0.1,
  relevance: 0.5,
  consequential: false,
  question: null,
  explanation: "No consequential change in the exact supplied revision.",
  evidenceIds: ["E1"],
  nextStep: "wait",
  restartCondition: "An independently scheduled frontier sweep.",
};
async function setup(audienceReader = false) {
  const f = await fixture();
  const scope = await prepareAmbientScope(f.context(), {
    operationKey: "ambient-scheduled-authority",
    pageId: f.page.pageId,
    objective: "Inspect permitted changes",
    refs: f.refs,
    audience: audienceReader ? [f.owner, f.reader] : [f.owner],
    auditPercent: 100,
  });
  await scheduleAmbient(binding());
  const view = await ambientView(f.context(), scope.value.id);
  expect(view.events.map((e) => e.kind).sort()).toEqual([
    "change",
    "frontier-sweep",
  ]);
  return { ...f, scopeId: scope.value.id, view };
}
async function noDiscovery(workspaceId: string) {
  expect(await count("intelligence_inquiries", workspaceId)).toBe(0);
  expect(await count("intelligence_effects", workspaceId)).toBe(0);
  expect(
    await env.DB.prepare(
      "SELECT count(*) n FROM notification_outbox WHERE workspace_id=? AND event='contradiction'",
    )
      .bind(workspaceId)
      .first<number>("n"),
  ).toBe(0);
}
test('INQ-004 — revoked or expired scheduled route qualification blocks dispatch without model substitution',async()=>{
 // Revocation and expiry invalidate the exact scheduled route before any provider dispatch.
 for(const run of [
  // Original case: INQ-004 — scheduled exact route revocation blocks dispatch and never substitutes a model
  async()=>{
  const f = await setup();
  expect((await chooseRoute(f.context(), "routing", true)).route.role).toBe(
    "frontier",
  );
  const evaluations = f.routes.filter((r) => r.tasks.includes("routing"));
  for (const route of evaluations)
    await env.DB.prepare(
      "UPDATE intelligence_route_evaluations SET revoked_at=? WHERE id=?",
    )
      .bind(f.context().now, route.evaluationId)
      .run();
  await expect(chooseRoute(f.context(), "routing", true)).rejects.toMatchObject(
    { code: "MODEL_ROUTE_UNQUALIFIED" },
  );
  const calls = transport({ ...answer, ambientAssessment: assessment });
  for (const event of f.view.events)
    await consumeIntelligenceJob(binding(), {
      kind: "intelligence.run",
      workspaceId: f.workspaceId,
      runId: event.run_id,
    });
  expect(calls()).toBe(0);
  await scheduleAmbient(binding());
  const view = await ambientView(f.context(), f.scopeId);
  expect(view.events).toHaveLength(2);
  expect(
    view.events.every(
      (e) =>
        e.state === "failed" &&
        e.failure_reason === "MODEL_ROUTE_REVOKED" &&
        !e.assessment_json,
    ),
  ).toBe(true);
  expect(
    await env.DB.prepare(
      "SELECT count(*) n FROM intelligence_budgets WHERE workspace_id=? AND released_at IS NULL",
    )
      .bind(f.workspaceId)
      .first<number>("n"),
  ).toBe(0);
  await noDiscovery(f.workspaceId);

  },
  // Original case: INQ-004 — expiration after scheduling refuses both direct frontier and queued semantic work
  async()=>{
  const f = await setup();
  for (const route of f.routes.filter((r) => r.tasks.includes("routing")))
    await env.DB.prepare(
      "UPDATE intelligence_route_evaluations SET expires_at=? WHERE id=?",
    )
      .bind("2000-01-01T00:00:00.000Z", route.evaluationId)
      .run();
  await expect(chooseRoute(f.context(), "routing", true)).rejects.toMatchObject(
    { code: "MODEL_ROUTE_UNQUALIFIED" },
  );
  const calls = transport({ ...answer, ambientAssessment: assessment });
  for (const event of f.view.events)
    await consumeIntelligenceJob(binding(), {
      kind: "intelligence.run",
      workspaceId: f.workspaceId,
      runId: event.run_id,
    });
  expect(calls()).toBe(0);
  await scheduleAmbient(binding());
  const view = await ambientView(f.context(), f.scopeId);
  expect(
    view.events.every(
      (e) => e.state === "failed" && e.failure_reason === "MODEL_ROUTE_REVOKED",
    ),
  ).toBe(true);
  console.info("U5_NATIVE_INQ004_EXPIRY", JSON.stringify(view));
  await noDiscovery(f.workspaceId);

  }
 ]){
  await resetDeployment();
  try{await run();}finally{vi.unstubAllGlobals();}
  }
});
test("INQ-004 — source access lost during metered assessment refuses publication and later disclosure", async () => {
  const f = await setup(true),
    event = f.view.events.find((e) => e.kind === "change")!;
  const calls = transport(
    {
      ...answer,
      ambientAssessment: {
        ...assessment,
        consequential: true,
        question: "Should this handoff change?",
        impact: 1,
        relevance: 1,
        nextStep: "investigate",
      },
    },
    () => revokeReader(f),
  );
  await consumeIntelligenceJob(binding(), {
    kind: "intelligence.run",
    workspaceId: f.workspaceId,
    runId: event.run_id,
  });
  expect(calls()).toBe(1);
  const run = await env.DB.prepare(
    "SELECT status,failure_reason,output_json,cost_micros FROM intelligence_runs WHERE id=?",
  )
    .bind(event.run_id)
    .first<{
      status: string;
      failure_reason: string;
      output_json: string | null;
      cost_micros: number;
    }>();
  expect(run).toMatchObject({ status: "failed", output_json: null });
  expect(run!.failure_reason).toBeTruthy();
  expect(run!.cost_micros).toBe(20);
  await expect(
    ambientView(f.context(f.reader), f.scopeId),
  ).rejects.toMatchObject({ status: 404 });
  await scheduleAmbient(binding());
  expect(
    await env.DB.prepare(
      "SELECT state,reason FROM intelligence_ambient_scopes WHERE id=?",
    )
      .bind(f.scopeId)
      .first(),
  ).toMatchObject({ state: "blocked" });
  expect(
    await env.DB.prepare(
      "SELECT assessment_json FROM intelligence_ambient_events WHERE id=?",
    )
      .bind(event.id)
      .first<string>("assessment_json"),
  ).toBeNull();
  await noDiscovery(f.workspaceId);
});
test("INQ-004 — invalid semantic output is metered once and makes no fallback or guessed question", async () => {
  const f = await setup(),
    event = f.view.events.find((e) => e.kind === "change")!;
  const calls = transport(answer);
  await consumeIntelligenceJob(binding(), {
    kind: "intelligence.run",
    workspaceId: f.workspaceId,
    runId: event.run_id,
  });
  await scheduleAmbient(binding());
  expect(calls()).toBe(1);
  const view = await ambientView(f.context(), f.scopeId);
  expect(view.events.find((e) => e.id === event.id)).toMatchObject({
    state: "failed",
    failure_reason: "INVALID_AMBIENT_OUTPUT",
    assessment_json: null,
  });
  expect(view.events).toHaveLength(2);
  expect(
    await env.DB.prepare(
      "SELECT attempts,cost_micros,status FROM intelligence_runs WHERE id=?",
    )
      .bind(event.run_id)
      .first(),
  ).toMatchObject({ attempts: 1, cost_micros: 20, status: "failed" });
  await noDiscovery(f.workspaceId);
});
test("INQ-004 — deterministic low-score audits and frontier shadow retain exact missed-event lineage", async () => {
  const f = await setup(),
    ranked = f.view.events.find((e) => e.kind === "change")!,
    sweep = f.view.events.find((e) => e.kind === "frontier-sweep")!;
  expect(
    await env.DB.prepare("SELECT model FROM intelligence_runs WHERE id=?")
      .bind(ranked.run_id)
      .first<string>("model"),
  ).toBe("measured-test-fast");
  expect(
    await env.DB.prepare("SELECT model FROM intelligence_runs WHERE id=?")
      .bind(sweep.run_id)
      .first<string>("model"),
  ).toBe("measured-test-frontier");
  const expectedKey = await requestHash(f.refs);
  expect(ranked.event_key).toBe(expectedKey);
  const hash = await requestHash({
    scopeId: f.scopeId,
    eventKey: ranked.event_key,
  });
  const bucket = parseInt(hash.slice(0, 8), 16) % 100;
  expect(await auditSelected(f.scopeId, ranked.event_key, bucket)).toBe(false);
  expect(await auditSelected(f.scopeId, ranked.event_key, bucket + 1)).toBe(
    true,
  );
  let calls = transport({ ...answer, ambientAssessment: assessment });
  await consumeIntelligenceJob(binding(), {
    kind: "intelligence.run",
    workspaceId: f.workspaceId,
    runId: ranked.run_id,
  });
  expect(calls()).toBe(1);
  let view = await ambientView(f.context(), f.scopeId);
  const independent = view.events.filter(
    (e) => e.kind === "shadow" || e.kind === "low-score-audit",
  );
  expect(independent).toHaveLength(2);
  for (const event of independent) {
    expect(event.comparison_event_id).toBe(ranked.id);
    expect(event.event_key).toBe(ranked.event_key);
    expect(JSON.parse(event.refs_json)).toEqual(f.refs);
  }
  calls = transport({
    ...answer,
    ambientAssessment: {
      ...assessment,
      consequential: true,
      question: "Which owner should inspect the missed gap?",
      impact: 1,
      relevance: 1,
      nextStep: "investigate",
    },
  });
  for (const event of view.events.filter((e) => e.state === "running"))
    await consumeIntelligenceJob(binding(), {
      kind: "intelligence.run",
      workspaceId: f.workspaceId,
      runId: event.run_id,
    });
  expect(calls()).toBe(3);
  view = await ambientView(f.context(), f.scopeId);
  expect(view.events.every((e) => e.state === "assessed")).toBe(true);
  expect(view.comparisons).toHaveLength(2);
  expect(
    view.comparisons.every(
      (c) => c.missed === true && c.rankedEventId === ranked.id,
    ),
  ).toBe(true);
  console.info("U5_NATIVE_INQ004_LINEAGE", JSON.stringify(view));
  expect(
    await env.DB.prepare(
      "SELECT count(*) n FROM notification_outbox WHERE workspace_id=? AND event='contradiction'",
    )
      .bind(f.workspaceId)
      .first<number>("n"),
  ).toBe(1);
  await scheduleAmbient(binding());
  expect((await ambientView(f.context(), f.scopeId)).events).toHaveLength(4);
});


test("INQ-004 — audience source revocation before consumption prevents any semantic dispatch", async () => {
  const f = await setup(true);
  await revokeReader(f);
  const calls = transport({ ...answer, ambientAssessment: assessment });
  for (const event of f.view.events)
    await consumeIntelligenceJob(binding(), {
      kind: "intelligence.run",
      workspaceId: f.workspaceId,
      runId: event.run_id,
    });
  expect(calls()).toBe(0);
  const runs = await env.DB.prepare(
    "SELECT status,failure_reason,output_json,cost_micros FROM intelligence_runs WHERE workspace_id=?",
  )
    .bind(f.workspaceId)
    .all();
  expect(runs.results).toHaveLength(2);
  expect(
    runs.results.every(
      (r) =>
        r.status === "failed" && r.output_json === null && r.cost_micros === 0,
    ),
  ).toBe(true);
  await scheduleAmbient(binding());
  const scope = await env.DB.prepare(
    "SELECT state,reason FROM intelligence_ambient_scopes WHERE id=?",
  )
    .bind(f.scopeId)
    .first();
  expect(scope).toMatchObject({ state: "blocked" });
  await expect(
    ambientView(f.context(f.reader), f.scopeId),
  ).rejects.toMatchObject({ status: 404 });
  console.info(
    "U5_NATIVE_INQ004_SOURCE_REVOKED",
    JSON.stringify({ runs: runs.results, scope }),
  );
  await noDiscovery(f.workspaceId);
});
