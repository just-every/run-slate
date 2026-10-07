import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalysisRecord } from "../../../src/core/features/inquiries/ui/AnalysisRecord";
import { EffectReceipt } from "../../../src/core/features/effects/ui/EffectReceipt";
import { TrialPanel } from "../../../src/core/features/experiments/ui/TrialPanel";

test("a comparison exposes its interval and reproducible inputs without claiming causality", () => {
  const html = renderToStaticMarkup(
    <AnalysisRecord
      analysis={{
        id: "analysis",
        kind: "compare-means",
        engine_version: "difference-means-conservative-t-v1",
        inputs_json: JSON.stringify({ treatment: [1, 2], comparison: [3, 4] }),
        input_hash: "retained-input-fingerprint",
        created_at: "2026-09-27T00:00:00Z",
        result_json: JSON.stringify({
          effect: 2,
          lower: -1,
          upper: 5,
          confidence: 0.95,
        }),
      }}
    />,
  );
  assert.match(html, /95% interval/);
  assert.match(html, /-1/);
  assert.match(html, /Reproduce this analysis/);
  assert.match(html, /retained-input-fingerprint/);
  assert.match(html, /does not establish causality/);
});
test("an uncertain write offers reconciliation and never labels itself confirmed", () => {
  const html = renderToStaticMarkup(
    <EffectReceipt
      effect={{
        id: "effect",
        idempotencyKey: "key",
        operation: "github.issue.update",
        target: { id: "target", kind: "external", revisionId: "revision" },
        intentAt: "2026-09-27T00:00:00Z",
        state: "uncertain",
      }}
      reload={() => {}}
    />,
  );
  assert.match(html, /Confirmation is still unknown/);
  assert.match(html, /Check confirmation/);
  assert.doesNotMatch(html, /Confirmed by the owning system/);
  assert.match(html, /No duplicate update/);
});
test("an inconclusive trial preserves the original forecast and measured uncertainty", () => {
  const plan = {
    eligibility: "Eligible cohort",
    assignment: [{ subjectId: "a", arm: "treatment" }],
    assignmentMethod: "observational",
    confounding: ["Non-random assignment"],
    baseline: "Prior cohort",
    metric: "Time to value",
    meaningfulEffect: 4,
    maximumHalfWidth: 1,
    startsAt: "2026-09-01T00:00:00Z",
    endsAt: "2026-09-15T00:00:00Z",
    supportGuardrail: 20,
    contactLimit: 1,
    maximumCostMicros: 1000000,
    forecast: "Expected four minutes of improvement",
    instrumentationRevision: "instrument-v1",
  };
  const html = renderToStaticMarkup(
    <TrialPanel
      trial={{
        id: "trial",
        state: "completed",
        revision_id: "r",
        plan_json: JSON.stringify(plan),
        outcome_json: JSON.stringify({
          classification: "inconclusive",
          reason: "The interval remains too wide.",
          estimate: {
            effect: 2,
            lower: -2,
            upper: 6,
            halfWidth: 4,
            confidence: 0.95,
          },
        }),
      }}
      reload={() => {}}
    />,
  );
  assert.match(html, /Expected four minutes of improvement/);
  assert.match(html, /The interval remains too wide/);
  assert.match(html, /Uncertainty half-width/);
  assert.match(html, /does not establish an effect/);
  assert.doesNotMatch(html, /rules out the predeclared meaningful benefit/);
});
