import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, request, mutate } from "../../../src/core/client/transport";

test("a rejected save preserves structured conflict information", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        code: "revision_conflict",
        message: "Another member saved this block.",
        details: { revisionId: "new" },
      }),
      { status: 409 },
    );
  try {
    await assert.rejects(
      mutate("/api/pages/p/blocks/b", { operationKey: "same" }),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 409);
        assert.deepEqual(error.details, { revisionId: "new" });
        return true;
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("transport refuses a cross-origin credential destination", async () => {
  await assert.rejects(
    request("https://other.example/api/pages"),
    /same-origin/,
  );
});

test("unreadable success is never accepted as a mutation receipt", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("<html>Sign in</html>");
  try {
    await assert.rejects(mutate("/api/pages", {}), /not been confirmed/);
  } finally {
    globalThis.fetch = original;
  }
});
