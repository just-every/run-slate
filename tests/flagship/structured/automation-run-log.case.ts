import { env } from "cloudflare:test";
import { expect } from "vitest";
import { createApi } from "../../../src/core/app/hono";
import { createUlid } from "../../../src/core/shared/ulid";
import { sessionFor } from "../../e2e/setup/fixtures";
import { setup } from "./repair-fixture";
import { runAutomationMaintenance } from "../../../src/core/features/automation/events";
import { defaultAutomationLimits } from "../../../src/core/features/automation/jobs";

/** Native rule and run HTTP, real content outbox, and real D1 action rollback. */
export async function automationRunLogCase() {
  const { ctx, reader, containerId } = await setup();
  const app = createApi(), origin = new URL(String(env.APP_URL)).origin;
  const cookies = new Map(await Promise.all([ctx.actor.id, reader.actor.id].map(async id => [id, await sessionFor(id)] as const)));
  const request = async (method: string, path: string, body?: unknown, actor = ctx.actor.id) => {
    const response = await app.request(origin + path, { method, headers: { cookie: cookies.get(actor)!, origin, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }, env);
    return { status: response.status, body: await response.json<any>() };
  };
  const ok = async (method: string, path: string, body?: unknown) => {
    const result = await request(method, path, body);
    expect(result.status, JSON.stringify(result.body)).toBeGreaterThanOrEqual(200);
    expect(result.status, JSON.stringify(result.body)).toBeLessThan(300);
    return result.body;
  };
  const mutate = (path: string, body: object) => ok("POST", path, { operationKey: createUlid(), ...body });
  const db = (await mutate("/api/databases", { containerId, title: "Run history" })).value;
  const definition = { name: "Inspect intake", scope: "source", sourceDatabaseId: db.id, trigger: { event: "record-created" }, conditions: [], actions: [{ type: "comment", body: "Recorded exactly once" }] };
  const rule = (await mutate("/api/automation", definition)).value;
  const logs = async (id = rule.id) => (await ok("GET", `/api/automation/${id}/runs`)).items;
  const observed = new Set<string>();
  const observe = async (state: string, id = rule.id) => {
    const row = (await logs(id)).find((item: any) => item.state === state);
    expect(row, `Native log reaches ${state}`).toBeTruthy();
    expect(row.actor).toEqual({ id: ctx.actor.id, name: "Owner" });
    expect(Number.isFinite(Date.parse(row.created_at))).toBe(true);
    observed.add(state); return row;
  };
  await observe("configuration-changed");
  const empty = (await mutate("/api/automation", { ...definition, name: "Empty action", actions: [] })).value;
  const unmet = (await mutate("/api/automation", { ...definition, name: "Unmet condition", conditions: [{ field: "absent", op: "eq", value: "not present" }] })).value;
  const disabled = (await mutate("/api/automation", { ...definition, name: "Paused", disabled: true })).value;
  const record = (await mutate(`/api/databases/${db.id}/records`, { title: "Visible intake", values: {} })).value;
  // Observe genuine durable transitions at the storage boundary without replacing their writes.
  const observer = new Proxy(ctx.db, { get(target, key) {
    if (key === "prepare") return (sql: string) => {
      const wrap = (statement: D1PreparedStatement, args: unknown[] = []): D1PreparedStatement => new Proxy(statement, { get(statement, key) {
        if (key === "bind") return (...args: unknown[]) => wrap(statement.bind(...args), args);
        if (key === "run" && sql.startsWith("UPDATE automation_jobs SET state='running'")) return async () => {
          const job = await target.prepare("SELECT rule_id FROM automation_jobs WHERE id=?").bind(args[1]).first<{rule_id:string}>();
          if (job?.rule_id === rule.id) await observe("queued");
          return statement.run();
        };
        if (key === "run" && sql.startsWith("UPDATE automation_runs SET state='running'")) return async () => {
          const result = await statement.run();
          const run = await target.prepare("SELECT rule_id FROM automation_runs WHERE id=?").bind(args[1]).first<{rule_id:string}>();
          if (run?.rule_id === rule.id) await observe("running");
          return result;
        };
        const value = Reflect.get(statement, key); return typeof value === "function" ? value.bind(statement) : value;
      }});
      return wrap(target.prepare(sql));
    };
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  }});
  await runAutomationMaintenance({ ...ctx, db: observer, now: new Date().toISOString() });
  const success = await observe("success");
  expect(success.trigger).toMatchObject({ event: "record-created", pageId: record.pageId, databaseId: db.id });
  expect(success.records).toEqual([{ id: record.pageId, title: "Visible intake" }]);
  expect(success.receipts).toMatchObject([{ actionIndex: 0, targetId: record.pageId, state: "confirmed" }]);
  await observe("no-action", empty.id); await observe("condition-not-met", unmet.id); await observe("disabled", disabled.id);
  const count = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM comments c JOIN comment_threads t ON t.id=c.thread_id WHERE t.page_id=?").bind(record.pageId).first<{n:number}>())!.n;
  expect(await count()).toBe(1);
  const operation = `auto:${success.id}:0:${record.pageId}`;
  expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM operation_receipts WHERE operation_key=?").bind(operation).first()).toEqual({n:1});
  expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM activity_entries WHERE operation_key=? AND target_id IN (SELECT id FROM comment_threads WHERE page_id=?)").bind(operation, record.pageId).first()).toEqual({n:1});
  await runAutomationMaintenance({ ...ctx, now: new Date().toISOString() });
  expect(await count()).toBe(1); expect((await logs()).filter((run: any) => run.state === "success")).toHaveLength(1);
  // A readable source rule does not confer access to a newly restricted touched record.
  await env.DB.prepare("UPDATE pages SET access_inheritance='restricted',author_member_id=?,owner_member_id=? WHERE id=?").bind(reader.actor.id,reader.actor.id,record.pageId).run();
  const redacted = (await logs()).find((run: any) => run.id === success.id);
  expect(redacted.records).toEqual([]); expect(redacted.trigger.pageId).toBeUndefined(); expect(redacted.receipts).toEqual([]);
  expect((await request("GET", `/api/automation/${rule.id}/runs`, undefined, reader.actor.id)).status).toBe(404);
  await env.DB.prepare("UPDATE pages SET access_inheritance='inherit',author_member_id=?,owner_member_id=? WHERE id=?").bind(ctx.actor.id,ctx.actor.id,record.pageId).run();
  // Real storage faults abort the native comment batch; no fabricated run or receipt rows.
  await env.DB.exec("CREATE TRIGGER synthetic_slate_action_fault BEFORE INSERT ON comments BEGIN SELECT RAISE(ABORT,'synthetic-slate-1'); END;");
  let clock = Date.now();
  const drain = async () => { clock += 300000; await runAutomationMaintenance({ ...ctx, now: new Date(clock).toISOString() }); };
  try {
    for (let failure = 0; failure < defaultAutomationLimits.consecutiveFailures; failure++) {
      await mutate(`/api/databases/${db.id}/records`, { title: `Retry intake ${failure}`, values: {} });
      await drain();
      const error = await observe("error");
      expect(error.finished_at).toBeNull(); expect(error.detail.error).toBe("ACTION_FAILED");
      expect((await ok("GET", "/api/automation")).items.find((item: any) => item.id === rule.id).latestFailure.state).toBe("error");
      await drain(); await drain();
      const failed = await observe("failure");
      expect(failed.id).toBe(error.id); expect(failed.finished_at).toBeTruthy();
      const current = (await ok("GET", "/api/automation")).items.find((item: any) => item.id === rule.id);
      expect(current.consecutive_failures).toBe(failure + 1);
      expect(!!current.disabled_at).toBe(failure + 1 === defaultAutomationLimits.consecutiveFailures);
    }
  } finally { await env.DB.exec("DROP TRIGGER synthetic_slate_action_fault"); }
  const paused = (await ok("GET", "/api/automation")).items.find((item: any) => item.id === rule.id);
  expect(paused.disabled_reason).toBe("Disabled after repeated failures.");
  await mutate(`/api/databases/${db.id}/records`, { title: "After disabled", values: {} }); await drain();
  expect((await observe("disabled")).detail.reason).toBe(paused.disabled_reason);
  expect(await count()).toBe(1);
  // Reach the production rate boundary with actual native events and retain its throttled log.
  const rateRule = (await mutate("/api/automation", { ...definition, name: "Rate history", actions: [] })).value;
  const rateClock = new Date(clock + 300000).toISOString();
  for (let index = 0; index <= defaultAutomationLimits.runsPerMinute; index++) {
    await mutate(`/api/databases/${db.id}/records`, { title: `Rate intake ${index}`, values: {} });
  }
  await runAutomationMaintenance({ ...ctx, now: rateClock });
  await runAutomationMaintenance({ ...ctx, now: rateClock });
  await observe("throttled", rateRule.id);
  expect([...observed].sort()).toEqual(["configuration-changed", "queued", "running", "success", "no-action", "condition-not-met", "throttled", "error", "failure", "disabled"].sort());
  console.log("PROBE AUTO-003 run-record: native rule and run HTTP plus real content outbox -> all ten states, readable trigger and records, actor and time, duplicate-safe receipts and activity, current-access redaction");
  console.log("PROBE AUTO-003 1: controlled native D1 action faults -> durable error retries, terminal failures, production repeated-failure disable reason and rule-list failure summary");
  console.log("PROBE AUTO-003 2: real native events at production rate boundary -> retained throttled and disabled logs; no duplicated effects after replay");
}
