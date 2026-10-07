import { SELF, env } from "cloudflare:test";
import { expect } from "vitest";
import { contract } from "../contract";

/**
 * The reference Workers-runtime journey. Copy this shape for feature clauses:
 * drive the real Worker through `SELF.fetch`, then assert against the same
 * local D1 the Worker wrote to. `migrations/core/` is already applied by
 * `tests/e2e/setup/apply-migrations.ts`.
 */

contract("BASE-OPS-001", "health reports ready when the database answers", async () => {
  const response = await SELF.fetch("https://slate.test/health");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    status: "ok",
    checks: { database: { status: "reachable" }, files: { status: "reachable" } },
  });
});

contract("BASE-OPS-001", "the knowledge foundation migration has been applied", async () => {
  const table = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
  )
    .bind("workspaces")
    .first<{ name: string }>();

  expect(table?.name).toBe("workspaces");

  const empty = await env.DB.prepare("SELECT count(*) AS total FROM workspaces").first<{ total: number }>();
  expect(empty?.total).toBe(0);
});
