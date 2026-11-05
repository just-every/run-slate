import { env, SELF } from "cloudflare:test";
import { expect } from "vitest";
import seed from "../../../seed.json";
import { resetDeployment } from "../../e2e/setup/reset-deployment";
import { sessionFor } from "../../e2e/setup/fixtures";
import { setup } from "./repair-fixture";
import { runAutomationMaintenance } from "../../../src/core/features/automation/events";
import { defaultAutomationLimits } from "../../../src/core/features/automation/jobs";

/** Native mutations supply every event and ancestor; only identity and the maintenance clock are fixtures. */
export async function automationBoundsJourney() {
  const depth = seed.limits.capacityEstimate.automationChainDepth;
  for (const scope of ["source", "container", "site"] as const) {
    for (const mode of ["self", "chain", "rate"] as const) {
      await resetDeployment();
      const { ctx, containerId } = await setup();
      const cookie = await sessionFor(ctx.actor.id);
      let operation = 0;
      const call = async (method: string, path: string, data?: object) => {
        const response = await SELF.fetch(`http://localhost/api${path}`, {
          method,
          headers: { cookie, origin: "http://localhost", "content-type": "application/json" },
          ...(data ? { body: JSON.stringify(data) } : {}),
        });
        const body = await response.json() as any;
        expect(response.status, `${method} ${path}: ${JSON.stringify(body)}`).toBeLessThan(300);
        return body;
      };
      const mutate = async (path: string, data: object) =>
        (await call("POST", path, { operationKey: `synthetic-slate-${scope}-${mode}-${++operation}`, ...data })).value;
      const database = await mutate("/databases", { containerId, title: "Bounded intake" });
      const base = `/databases/${database.id}`;
      await mutate(base + "/fields", { expectedRevisionId: database.revisionId,
        field: { id: "hop", name: "Hop", type: "number", config: {}, position: 0 } });
      const rules: {id:string;revisionId:string}[] = [];
      for (let hop = 0; hop < (mode === "chain" ? depth + 1 : 1); hop++) {
        rules.push(await mutate("/automation", {
          name: `${mode} ${hop}`, scope,
          ...(scope === "source" ? { sourceDatabaseId: database.id } : scope === "container" ? { containerId } : {}),
          trigger: { event: "record-created" },
          conditions: mode === "chain" ? [{ field: "hop", op: "eq", value: hop }] : [],
          actions: mode === "rate"
            ? [{ type: "comment", body: [{ text: "Intake acknowledged" }] }]
            : [{ type: "create-record", databaseId: database.id, title: `Generated ${hop + 1}`, values: { hop: hop + 1 } }],
        }));
      }
      // Holding the runner's clock fixes one rate window without replacing limits or stored events.
      const runner = { ...ctx, now: new Date().toISOString() };
      const drain = async () => {
        for (let turn = 0; turn < 30; turn++) {
          await runAutomationMaintenance(runner);
          const pending = await env.DB.prepare(`SELECT
            (SELECT COUNT(*) FROM content_events WHERE sequence>COALESCE((SELECT sequence FROM automation_event_cursors WHERE workspace_id=?),0)) AS events,
            (SELECT COUNT(*) FROM automation_jobs WHERE state IN ('queued','running')) AS jobs`).bind(ctx.actor.workspaceId).first<{events:number;jobs:number}>();
          if (pending?.events === 0 && pending.jobs === 0) return;
        }
        throw new Error("Native automation outbox did not settle.");
      };
      const records = async () => (await env.DB.prepare("SELECT page_id,field_values_json AS values_json FROM database_records WHERE database_id=? ORDER BY page_id").bind(database.id).all()).results;
      const runs = async () => (await env.DB.prepare("SELECT * FROM automation_runs WHERE workspace_id=? AND state<>'configuration-changed' ORDER BY id").bind(ctx.actor.workspaceId).all<any>()).results;
      const snapshot = async () => ({ records: await records(), runs: await runs(),
        effects: (await env.DB.prepare("SELECT * FROM automation_action_receipts ORDER BY run_id,action_index,target_id").all()).results,
        receipts: (await env.DB.prepare("SELECT * FROM operation_receipts WHERE operation_key LIKE 'auto:%' ORDER BY operation_key").all()).results,
        activity: (await env.DB.prepare("SELECT * FROM activity_entries ORDER BY id").all()).results,
      });
      const roots = [];
      for (let index = 0; index < (mode === "rate" ? defaultAutomationLimits.runsPerMinute : 1); index++) {
        roots.push(await mutate(base + "/records", { title: `Native intake ${index}`, values: { hop: 0 } }));
      }
      await drain();
      if (mode === "rate") {
        expect((await runs()).filter(run => run.state === "success")).toHaveLength(defaultAutomationLimits.runsPerMinute);
        expect((await runs()).filter(run => run.state === "throttled")).toHaveLength(0);
        const overflow = await mutate(base + "/records", { title: "Overflow retained", values: { hop: 0 } });
        roots.push(overflow);
        await drain();
        const all = await runs();
        expect(all.filter(run => run.state === "success")).toHaveLength(defaultAutomationLimits.runsPerMinute);
        const refused = all.filter(run => run.state === "throttled");
        expect(refused).toHaveLength(1);
        expect(JSON.parse(refused[0].trigger_json).pageId).toBe(overflow.pageId);
        expect(JSON.parse(refused[0].detail_json).reason).toBe("Workspace automation rate limit reached.");
        expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM automation_action_receipts WHERE run_id=?").bind(refused[0].id).first<{n:number}>())?.n).toBe(0);
        const comments = (await env.DB.prepare("SELECT t.page_id,c.body_json FROM comments c JOIN comment_threads t ON t.id=c.thread_id").all<{page_id:string;body_json:string}>()).results;
        expect(comments.map(comment => comment.page_id).sort()).toEqual(roots.slice(0,-1).map(root => root.pageId).sort());
        expect(comments.every(comment => JSON.parse(comment.body_json)[0].text === "Intake acknowledged")).toBe(true);
        expect((await records())).toHaveLength(roots.length);
        const log = await call("GET", `/automation/${rules[0].id}/runs`);
        expect(log.items.find((run:any) => run.id === refused[0].id)).toMatchObject({ state: "throttled", reason: "Workspace automation rate limit reached.", receipts: [] });
      } else {
        const all = await runs();
        const successful = all.filter(run => run.state === "success").sort((a,b) => a.chain_depth-b.chain_depth);
        expect(successful).toHaveLength(mode === "self" ? 1 : depth);
        const expectedHops = Array.from({length:successful.length+1},(_,hop)=>hop);
        expect((await records()).map((record:any) => JSON.parse(record.values_json).hop).sort((a,b)=>a-b)).toEqual(expectedHops);
        let parent: any;
        for (const [hop,run] of successful.entries()) {
          expect(run.rule_id).toBe(rules[mode === "self" ? 0 : hop].id);
          expect(run.chain_depth).toBe(hop);
          expect(run.parent_run_id).toBe(parent?.id ?? null);
          const event = JSON.parse(run.trigger_json);
          expect(event.chainRuleIds).toEqual(successful.slice(0,hop).map(run=>run.rule_id));
          const source = await env.DB.prepare("SELECT revision_id,page_id FROM content_events WHERE sequence=?").bind(Number(event.key.slice("content:".length))).first<{revision_id:string;page_id:string}>();
          expect(source?.page_id).toBe(event.pageId);
          const receipt = await env.DB.prepare("SELECT operation_key FROM operation_receipts WHERE json_extract(response_json,'$.receipt.revisionId')=?").bind(source!.revision_id).first<{operation_key:string}>();
          expect(receipt?.operation_key).toBe(parent ? `auto:${parent.id}:0:${JSON.parse(parent.trigger_json).pageId}` : `synthetic-slate-${scope}-${mode}-${operation}`);
          parent = run;
        }
        const boundary = all.filter(run => run.chain_depth === successful.length);
        expect(boundary).toHaveLength(rules.length);
        expect(boundary.every(run => run.state === "throttled" && run.parent_run_id === parent.id)).toBe(true);
        const terminal = boundary.find(run => run.rule_id === rules.at(-1).id)!;
        const log = await call("GET", `/automation/${terminal.rule_id}/runs`);
        expect(log.items.find((run:any)=>run.id===terminal.id)).toMatchObject({ state: "throttled", reason: "Automation chain limit reached.", receipts: [] });
        expect((await snapshot()).receipts).toHaveLength(successful.length);
      }
      const before = await snapshot();
      const logs = await Promise.all(rules.map(rule=>call("GET", `/automation/${rule.id}/runs`)));
      await drain();
      await drain();
      expect(await snapshot()).toEqual(before);
      expect(await Promise.all(rules.map(rule=>call("GET", `/automation/${rule.id}/runs`)))).toEqual(logs);
      console.log(`PROBE AUTO-004 ${scope} ${mode}: native HTTP, committed outbox, D1 ancestry and run log -> bounded effects, retained reason, replay unchanged`);
    }
  }
}
