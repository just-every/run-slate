import { expect, vi, test } from "vitest";
import { gzipSync, zlibSync } from "fflate";

test("nested compressed bombs are rejected before large decoder allocations", async () => {
  const source = new Uint8Array(8 * 1024 * 1024);
  const inputs = [gzipSync(source), zlibSync(source)];
  vi.resetModules();
  const NativeUint8Array = globalThis.Uint8Array;
  let largestAllocation = 0;
  const oversized: number[] = [];
  globalThis.Uint8Array = new Proxy(NativeUint8Array, {
    construct(target, args) {
      if (typeof args[0] === "number") {
        largestAllocation = Math.max(largestAllocation, args[0]);
        if (args[0] > 512 * 1024) {
          oversized.push(args[0]);
          throw new Error("Decoder exceeded fixed scratch allowance");
        }
      }
      return Reflect.construct(target, args);
    },
  });
  const errors: unknown[] = [];
  try {
    const { gunzipBounded, inflateBounded } = await import("../../../src/core/features/imports/inflate");
    for (const [index, decode] of [gunzipBounded, inflateBounded].entries()) {
      try {
        decode(inputs[index]!, {
          expandedBytes: 0,
          maximumExpandedBytes: 1024,
          maximumEntryBytes: 1024,
          maximumCompressionRatio: 1_000_000,
          what: "Test stream",
        });
      } catch (error) { errors.push(error); }
    }
  } finally {
    globalThis.Uint8Array = NativeUint8Array;
    vi.resetModules();
  }
  expect(errors).toHaveLength(2);
  for (const error of errors) expect(error).toMatchObject({ code: "IMPORT_ARCHIVE_LIMIT_EXCEEDED" });
  expect(oversized).toEqual([]);
  // Proves fflate captured the instrumented constructor, so a cached import
  // cannot silently turn this into an output-only regression test.
  expect(largestAllocation).toBeGreaterThanOrEqual(32768);
});
