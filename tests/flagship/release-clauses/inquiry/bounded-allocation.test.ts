import { test, expect } from "vitest";
import { env } from "cloudflare:test";
import { inquiry } from "./support";
import {
  recordAnalysis,
  inquiryView,
} from "../../../../src/core/features/inquiries/service";
import { requestHash } from "../../../../src/core/app/operations";
// Exhaustive subset enumeration is independent of the production dynamic program.
function oracle(
  items: { id: string; cost: number; value: number }[],
  capacity: number,
) {
  let best = { value: 0, ids: [] as string[], cost: 0 };
  for (let mask = 0; mask < 2 ** items.length; mask++) {
    const chosen = items.filter((_, i) => mask & (2 ** i)),
      cost = chosen.reduce((n, i) => n + i.cost, 0),
      value = chosen.reduce((n, i) => n + i.value, 0);
    if (cost <= capacity && value > best.value)
      best = { value, ids: chosen.map((i) => i.id), cost };
  }
  return best;
}
test("INQ-003 — persisted allocations expose exhaustive optimum, capacity sensitivity and invalid input atomicity", async () => {
  const f = await inquiry(),
    items = [
      { id: "greedy", cost: 3, value: 5 },
      { id: "pair-a", cost: 2, value: 3 },
      { id: "pair-b", cost: 2, value: 3 },
    ];
  const ids = [] as string[];
  for (const capacity of [3, 4]) {
    const analysis = { kind: "allocate" as const, items, capacity },
      expected = oracle(items, capacity);
    const saved = await recordAnalysis(f.context(), {
      id: f.inquiryId,
      operationKey: `allocation-${capacity}`,
      analysis,
      refs: f.refs,
    });
    ids.push(saved.value.id);
    const row = await env.DB.prepare(
      "SELECT * FROM intelligence_analyses WHERE id=?",
    )
      .bind(saved.value.id)
      .first<Record<string, unknown>>();
    expect(JSON.parse(String(row!.inputs_json))).toEqual(analysis);
    expect(row!.input_hash).toBe(await requestHash(analysis));
    expect(row!.engine_version).toBe("knapsack-01-v1");
    expect(JSON.parse(String(row!.refs_json))).toEqual(f.refs);
    console.info("U5_NATIVE_INQ003", JSON.stringify(row));
    expect(JSON.parse(String(row!.result_json))).toEqual({
      engine: "knapsack-01-v1",
      capacity,
      value: expected.value,
      ids: expected.ids,
      feasibilityOnly: true,
    });
    expect(expected.cost).toBeLessThanOrEqual(capacity);
  }
  expect(new Set(ids).size).toBe(2);
  expect(oracle(items, 4).ids).toEqual(["pair-a", "pair-b"]);
  const before = await env.DB.prepare(
    "SELECT count(*) n FROM intelligence_analyses WHERE inquiry_id=?",
  )
    .bind(f.inquiryId)
    .first<number>("n");
  const receipts = await env.DB.prepare(
    "SELECT count(*) n FROM operation_receipts WHERE workspace_id=?",
  )
    .bind(f.workspaceId)
    .first<number>("n");
  for (const [i, analysis] of [
    { kind: "allocate", items, capacity: -1 },
    { kind: "allocate", items, capacity: 2.5 },
    { kind: "allocate", items, capacity: 100001 },
    {
      kind: "allocate",
      items: [{ id: "bad", cost: 0, value: 9 }],
      capacity: 4,
    },
    {
      kind: "allocate",
      items: [{ id: "bad", cost: 1.2, value: 9 }],
      capacity: 4,
    },
  ].entries())
    await expect(
      recordAnalysis(f.context(), {
        id: f.inquiryId,
        operationKey: `invalid-allocation-${i}`,
        analysis: analysis as any,
        refs: f.refs,
      }),
    ).rejects.toMatchObject({ code: "INVALID_ALLOCATION" });
  expect(
    await env.DB.prepare(
      "SELECT count(*) n FROM intelligence_analyses WHERE inquiry_id=?",
    )
      .bind(f.inquiryId)
      .first<number>("n"),
  ).toBe(before);
  expect(
    await env.DB.prepare(
      "SELECT count(*) n FROM operation_receipts WHERE workspace_id=?",
    )
      .bind(f.workspaceId)
      .first<number>("n"),
  ).toBe(receipts);
  expect((await inquiryView(f.context(), f.inquiryId)).artifacts).toHaveLength(
    0,
  );
});
