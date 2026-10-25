import { SELF, env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { expect, vi } from "vitest";
import { contract } from "../contract";
import worker from "../../../src/server";
import type { AppBindings } from "../../../src/core/app/types";

/**
 * The reference Workers-runtime journey. Copy this shape for feature clauses:
 * drive the real Worker through `SELF.fetch`, then assert against the same
 * local D1 the Worker wrote to. `migrations/core/` is already applied by
 * `tests/e2e/setup/apply-migrations.ts`.
 */

contract("BASE-OPS-001", "health reports ready when the database answers", async () => {
  const response = await SELF.fetch("https://slate.test/health");

  expect(response.status).toBe(200);
  // Outside a Base deploy the identity variables are absent, so Base's `deploymentHealth` reports each identity field as null.
  expect(await response.json()).toEqual({
    ok: true,
    status: "ok",
    checks: { database: { status: "reachable" }, files: { status: "reachable" } },
    deployment: { sourceSha: null, fingerprint: null, versionId: null },
  });

  // Drive the public Worker with real D1/Queue bindings and a controllable R2
  // network edge: startup readiness, healthy, failed, recovered, then a hung dependency.
  const started = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(started);
  let calls = 0;
  let mode: "ready" | "failed" | "hung" = "ready";
  let release: () => void = () => {};
  const observe = <T extends object>(binding: T): T => new Proxy(binding, {
    get(target, key) {
      const value = Reflect.get(target, key);
      return typeof value === "function" ? (...args: unknown[]) => { calls++; return value.apply(target, args); } : value;
    },
  });
  const bindings = { ...env, DB: observe(env.DB), JOBS: observe(env.JOBS),
    FILES: { head: async (key: string) => {
      calls++;
      if (mode === "failed") throw new Error("R2 unavailable");
      if (mode === "hung") await new Promise<void>(resolve => { release = resolve; });
      return env.FILES.head(key);
    } } as R2Bucket,
    ASSETS: new Proxy(env.ASSETS, { get() { throw new Error("Health must bypass assets."); } }),
  } as AppBindings;
  const request = async (selected = bindings) => {
    const context = createExecutionContext();
    const response = await worker.fetch!(new Request("https://slate.test/health") as Request<unknown, IncomingRequestCfProperties>, selected, context);
    return { response, done: () => waitOnExecutionContext(context) };
  };
  try {
    const cold = await request();
    expect(cold.response.status).toBe(200);
    await cold.done();
    const observed = calls;
    for (let i = 0; i < 3; i++) {
      const warm = await request();
      expect(warm.response.status).toBe(200);
      expect(warm.response.headers.get("cache-control")).toBe("no-store");
      await warm.done();
    }
    expect(calls).toBe(observed);

    // A minute-spaced monitor with scheduling jitter must keep a healthy answer
    // while its next background check runs.
    clock.mockReturnValue(started + 65_000);
    const nextMonitor = await request();
    expect(nextMonitor.response.status).toBe(200);
    await nextMonitor.done();

    mode = "failed";
    clock.mockReturnValue(started + 96_000);
    const refreshing = await request();
    expect(refreshing.response.status).toBe(200);
    await refreshing.done();
    const failed = await request();
    expect(failed.response.status).toBe(503);
    expect(await failed.response.json()).toMatchObject({ code: "DEPENDENCY_UNAVAILABLE" });

    mode = "ready";
    clock.mockReturnValue(started + 127_000);
    const recovering = await request();
    expect(recovering.response.status).toBe(503);
    await recovering.done();
    expect((await request()).response.status).toBe(200);

    mode = "hung";
    clock.mockReturnValue(started + 158_000);
    const hanging = await request();
    expect(hanging.response.status).toBe(200);
    clock.mockReturnValue(started + 248_000);
    expect((await request()).response.status).toBe(503);
    await hanging.done();
    // Completing a timed-out probe cannot resurrect its old success.
    mode = "failed";
    release();
    const late = await request();
    expect(late.response.status).toBe(503);
    await late.done();
    expect((await request()).response.status).toBe(503);

    const startupBindings = { ...bindings, DB: observe(env.DB) };
    mode = "hung";
    clock.mockReturnValue(started + 300_000);
    const startup = await request(startupBindings);
    expect(startup.response.status).toBe(200);
    clock.mockReturnValue(started + 306_000);
    expect((await request(startupBindings)).response.status).toBe(503);
    await startup.done();
    release();
  } finally {
    release();
    clock.mockRestore();
  }
});
