import { test, expect } from "vitest";
import { env } from "cloudflare:test";
import { inquiry, revokeReader } from "./support";
import {
  recordAnalysis,
  recordFinding,
  inquiryView,
} from "../../../../src/core/features/inquiries/service";
test("INQ-002 — durable numerical replay separates observation, assumption, deduction and refused business authority", async () => {
  const f = await inquiry();
  let view = await inquiryView(f.context(), f.inquiryId);
  const hypothesisId = String(view.hypotheses[0]!.id);
  for (const kind of ["observation", "assumption", "deduction"] as const)
    await recordFinding(f.context(), {
      id: f.inquiryId,
      operationKey: `finding-${kind}`,
      hypothesisId,
      status: kind === "deduction" ? "disconfirmed" : "inconclusive",
      finding: `${kind}: scoped to supplied measured population`,
      kind,
      refs: f.refs,
    });
  const analysis = {
    kind: "compare-means" as const,
    treatment: [1, 3, 5],
    comparison: [4, 6, 8],
  };
  const saved = await recordAnalysis(f.context(), {
    id: f.inquiryId,
    operationKey: "replay-comparison",
    analysis,
    refs: f.refs,
  });
  const row = await env.DB.prepare(
    "SELECT * FROM intelligence_analyses WHERE id=?",
  )
    .bind(saved.value.id)
    .first<Record<string, unknown>>();
  const hashBytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      '{"comparison":[4,6,8],"kind":"compare-means","treatment":[1,3,5]}',
    ),
  );
  expect(row!.input_hash).toBe(
    Array.from(new Uint8Array(hashBytes), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join(""),
  );
  expect(row!.engine_version).toBe("difference-means-conservative-t-v1");
  expect(JSON.parse(String(row!.refs_json))).toEqual(f.refs);
  const inputs = JSON.parse(String(row!.inputs_json)),
    result = JSON.parse(String(row!.result_json));
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const mean = (xs: number[]) => sum(xs) / xs.length;
  const variance = (xs: number[]) =>
    sum(xs.map((x) => x * x)) / (xs.length - 1) -
    sum(xs) ** 2 / (xs.length * (xs.length - 1));
  const effect = mean(inputs.comparison) - mean(inputs.treatment),
    halfWidth =
      4.303 *
      Math.sqrt(
        variance(inputs.treatment) / 3 + variance(inputs.comparison) / 3,
      );
  expect(result.effect).toBeCloseTo(effect, 12);
  expect(result.halfWidth).toBeCloseTo(halfWidth, 12);
  expect(result.lower).toBeCloseTo(effect - halfWidth, 12);
  expect(result.upper).toBeCloseTo(effect + halfWidth, 12);
  expect(result.treatment).toEqual({ n: 3, mean: 3, variance: 4 });
  expect(result.comparison).toEqual({ n: 3, mean: 6, variance: 4 });
  view = await inquiryView(f.context(f.reader), f.inquiryId);
  expect(view.artifacts.map((a) => a.kind).sort()).toEqual([
    "assumption",
    "deduction",
    "observation",
  ]);
  expect(view.hypotheses.find((h) => h.id === hypothesisId)!.status).toBe(
    "disconfirmed",
  );
  const before = view.artifacts.length;
  await expect(
    recordFinding(f.context(), {
      id: f.inquiryId,
      operationKey: "finding-business-decision",
      hypothesisId,
      status: "supported",
      finding: "Approve a customer charge",
      kind: "decision",
      refs: f.refs,
    }),
  ).rejects.toMatchObject({ code: "ACCEPT_DECISION_SEPARATELY" });
  expect((await inquiryView(f.context(), f.inquiryId)).artifacts).toHaveLength(
    before,
  );
  expect(
    await env.DB.prepare(
      "SELECT count(*) n FROM knowledge_decisions WHERE workspace_id=?",
    )
      .bind(f.workspaceId)
      .first<number>("n"),
  ).toBe(0);
  console.info(
    "U5_NATIVE_INQ002",
    JSON.stringify({ analysis: row, artifacts: view.artifacts }),
  );
  await revokeReader(f);
  await expect(
    inquiryView(f.context(f.reader), f.inquiryId),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    recordAnalysis(f.context(), {
      id: f.inquiryId,
      operationKey: "revoked-analysis",
      analysis,
      refs: f.refs,
    }),
  ).rejects.toMatchObject({ status: 404 });
  expect(
    await env.DB.prepare(
      "SELECT count(*) n FROM intelligence_analyses WHERE inquiry_id=?",
    )
      .bind(f.inquiryId)
      .first<number>("n"),
  ).toBe(1);
});
