import { env } from "cloudflare:test";
import { test, expect } from "vitest";
import {
  seedWorkspace,
  seedMember,
  seedContainer,
  seedContainerGrant,
  seedPageGrant,
} from "../../e2e/setup/fixtures";
import type { FeatureContext } from "../../../src/core/app/feature-context";
import {
  createDatabase,
  saveField,
  setStructureLock,
  createRecord,
} from "../../../src/core/features/databases/service";
import {
  saveView,
  queryView,
} from "../../../src/core/features/databases/views";
import {
  updateRecord,
  openRecord,
} from "../../../src/core/features/databases/records";
import { evaluateFields } from "../../../src/core/features/databases/values";
import {
  saveTemplate,
  applyTemplate,
  changeTemplate,
} from "../../../src/core/features/templates/service";
import {
  createPage,
  readPage,
  updatePage,
} from "../../../src/core/features/pages/service";
import { saveRule } from "../../../src/core/features/automation/service";
import {
  enqueueAutomationEvent,
  processAutomationJob,
} from "../../../src/core/features/automation/jobs";
import { archivePage } from "../../../src/core/features/archive/service";
import { ApiProblem } from "../../../src/core/app/problems";
async function scenario() {
  const { workspaceId } = await seedWorkspace();
  const { memberId } = await seedMember(workspaceId, {
    role: "owner",
    email: `${workspaceId}@owner.invalid`,
    displayName: "Owner",
  });
  const { memberId: readerId } = await seedMember(workspaceId, {
    role: "member",
    email: `${workspaceId}@reader.invalid`,
    displayName: "Reader",
  });
  const { containerId } = await seedContainer(workspaceId, {
    ownerMemberId: memberId,
    visibility: "default",
  });
  await seedContainerGrant(containerId, {
    principalKind: "member",
    principalId: memberId,
    level: "full",
  });
  const ctx = {
    db: env.DB,
    files: env.FILES,
    jobs: env.JOBS,
    now: new Date().toISOString(),
    actor: {
      id: memberId,
      workspaceId,
      workspaceName: "Test",
      email: "owner@test.invalid",
      displayName: "Owner",
      initials: "OW",
      role: "owner",
    },
  } as FeatureContext;
  return {
    ctx,
    containerId,
    reader: {
      ...ctx,
      actor: { ...ctx.actor, id: readerId, role: "member" as const },
    },
  };
}
const adapters = {
  archive: (
    ctx: FeatureContext,
    id: string,
    input: {
      operationKey: string;
      expectedRevisionId: string;
      reason?: string;
    },
  ) => archivePage(ctx, id, { ...input, action: "archive" }),
  notify: async () => {
    throw new ApiProblem(
      503,
      "NOT_CONFIGURED",
      "No notification adapter configured in this isolated test.",
    );
  },
};
test("real D1 database structure CAS, record page revisions, replay and lock enforcement", async () => {
  const { ctx, containerId } = await scenario();
  const db = await createDatabase(ctx, {
    operationKey: "create-database-01",
    containerId,
    title: "Work",
  });
  const field = {
    id: "estimate",
    name: "Estimate",
    type: "number" as const,
    config: {},
    position: 0,
  };
  const definition = await saveField(ctx, db.value.id, {
    operationKey: "save-field-01",
    expectedRevisionId: db.receipt.revisionId,
    field,
  });
  await expect(
    saveField(ctx, db.value.id, {
      operationKey: "save-field-stale",
      expectedRevisionId: db.receipt.revisionId,
      field,
    }),
  ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  const rec = await createRecord(ctx, db.value.id, {
    operationKey: "create-record-01",
    title: "First",
    values: { estimate: 2 },
  });
  expect((await readPage(ctx, rec.value.pageId)).page.title).toBe("First");
  const changes = {
    operationKey: "record-change-01",
    expectedRevisionId: rec.receipt.revisionId,
    values: { estimate: 4 },
  };
  const [a, b] = await Promise.all([
    updateRecord({ ...ctx }, rec.value.pageId, changes),
    updateRecord({ ...ctx }, rec.value.pageId, changes),
  ]);
  expect(a).toEqual(b);
  expect((await readPage(ctx, rec.value.pageId)).page.revisionId).toBe(
    a.receipt.revisionId,
  );
  await setStructureLock(ctx, db.value.id, {
    operationKey: "structure-lock-01",
    expectedRevisionId: definition.receipt.revisionId,
    locked: true,
  });
  await expect(
    saveField(ctx, db.value.id, {
      operationKey: "locked-change-01",
      expectedRevisionId: definition.receipt.revisionId,
      field,
    }),
  ).rejects.toMatchObject({ code: "STRUCTURE_LOCKED" });
  expect(
    (
      await updateRecord(ctx, rec.value.pageId, {
        operationKey: "record-locked-01",
        expectedRevisionId: a.receipt.revisionId,
        values: { estimate: 8 },
      })
    ).value.values.estimate,
  ).toBe(8);
});
test("reader filtering precedes summaries and unauthorized reader cannot mutate", async () => {
  const { ctx, containerId, reader } = await scenario();
  const db = await createDatabase(ctx, {
    operationKey: "database-reader-01",
    containerId,
    title: "Work",
  });
  await seedPageGrant(db.value.pageId, {
    principalKind: "member",
    principalId: reader.actor.id,
    level: "view",
  });
  const a = await createRecord(ctx, db.value.id, {
    operationKey: "record-visible-01",
    title: "Visible",
    values: {},
  });
  const b = await createRecord(ctx, db.value.id, {
    operationKey: "record-private-01",
    title: "Hidden",
    values: {},
  });
  await env.DB.prepare(
    "UPDATE pages SET access_inheritance='restricted',lifecycle='draft' WHERE id=?",
  )
    .bind(b.value.pageId)
    .run();
  const view = {
    id: "view-reader",
    name: "All",
    layout: "table" as const,
    filters: [],
    sorts: [],
    groups: [],
    calculations: {},
    display: {},
    position: 0,
  };
  await saveView(ctx, db.value.id, {
    operationKey: "reader-view-save",
    expectedRevisionId: db.receipt.revisionId,
    view,
  });
  const result = await queryView(reader, db.value.id, view.id);
  expect(result.records.map((r) => r.pageId)).toEqual([a.value.pageId]);
  await expect(
    updateRecord(reader, a.value.pageId, {
      operationKey: "reader-edit-denied",
      expectedRevisionId: a.receipt.revisionId,
      values: {},
    }),
  ).rejects.toMatchObject({ status: 404 });
});
test("typed formula cycles reject and arithmetic evaluates without executable code", () => {
  const f = (id: string, expression: unknown) => ({
    id,
    name: id,
    type: "formula" as const,
    position: 0,
    config: { expression },
  });
  expect(() =>
    evaluateFields([f("a", { field: "b" }), f("b", { field: "a" })], {}),
  ).toThrow(/cycle/);
  expect(
    evaluateFields(
      [f("sum", { op: "add", args: [{ literal: 3 }, { literal: 4 }] })],
      {},
    ).sum,
  ).toBe(7);
});
test("template snapshots retain prescribed children independently and application replays", async () => {
  const { ctx, containerId } = await scenario();
  const source = await createPage(ctx, {
    operationKey: "template-source-01",
    containerId,
    title: "Root",
  });
  await createPage(ctx, {
    operationKey: "template-child-01",
    containerId,
    parentPageId: source.value.pageId,
    title: "Child",
  });
  const template = await saveTemplate(ctx, {
    operationKey: "template-save-01",
    sourcePageId: source.value.pageId,
    includeChildren: true,
    containerId: null,
    title: "Starter",
    description: "A starter",
    category: "Work",
  });
  const input = {
    operationKey: "template-apply-01",
    containerId,
    expectedRevisionId: template.receipt.revisionId,
  };
  const first = await applyTemplate(ctx, template.value.id, input);
  expect(first.value.pageIds).toHaveLength(2);
  expect(await applyTemplate(ctx, template.value.id, input)).toEqual(first);
  await changeTemplate(ctx, template.value.id, {
    operationKey: "template-archive-01",
    expectedRevisionId: template.receipt.revisionId,
    action: "archive",
  });
  expect((await readPage(ctx, first.value.pageId)).page.title).toBe("Root");
});
test("rule action executes once with durable receipts and revoked actor loses execution", async () => {
  const { ctx, containerId } = await scenario();
  const db = await createDatabase(ctx, {
    operationKey: "automation-db-01",
    containerId,
    title: "Work",
  });
  const record = await createRecord(ctx, db.value.id, {
    operationKey: "automation-record-01",
    title: "Task",
    values: {},
  });
  const rule = await saveRule(ctx, {
    operationKey: "automation-rule-01",
    name: "Comment",
    scope: "source",
    sourceDatabaseId: db.value.id,
    trigger: { event: "record-created" },
    conditions: [],
    actions: [{ type: "comment", body: "Tracked" }],
  });
  const event = {
    key: "event-1",
    event: "record-created",
    pageId: record.value.pageId,
    databaseId: db.value.id,
    containerId,
  };
  const queued = await enqueueAutomationEvent(ctx, event);
  expect(queued.jobIds).toHaveLength(1);
  const execution = await processAutomationJob(ctx, queued.jobIds[0], adapters);
  const log = await env.DB.prepare(
    "SELECT detail_json FROM automation_runs WHERE id=?",
  )
    .bind(execution!.runId)
    .first();
  expect(execution?.state, JSON.stringify(log)).toBe("success");
  await processAutomationJob(ctx, queued.jobIds[0], adapters);
  expect(
    (
      await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM comments c JOIN comment_threads t ON t.id=c.thread_id WHERE t.page_id=?",
      )
        .bind(record.value.pageId)
        .first<{
          n: number;
        }>()
    )?.n,
  ).toBe(1);
  expect((await enqueueAutomationEvent(ctx, event)).jobIds).toHaveLength(0);
  const next = await enqueueAutomationEvent(ctx, { ...event, key: "event-2" });
  await env.DB.prepare("UPDATE members SET status='removed' WHERE id=?")
    .bind(ctx.actor.id)
    .run();
  expect(
    (await processAutomationJob(ctx, next.jobIds[0], adapters))?.state,
  ).toBe("failure");
  expect(
    (await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM automation_action_receipts WHERE state='confirmed'",
    ).first<{
      n: number;
    }>())!.n,
  ).toBeGreaterThanOrEqual(1);
});
test("record body persists across both parity profiles", async () => {
  const { ctx, containerId } = await scenario();
  const db = await createDatabase(ctx, {
    operationKey: "parity-db-01",
    containerId,
    title: "Work",
  });
  const record = await createRecord(ctx, db.value.id, {
    operationKey: "parity-record-01",
    title: "Task",
    values: {},
  });
  expect((await openRecord(ctx, record.value.pageId)).parity).toBe(
    "record-is-page",
  );
  await env.DB.prepare(
    "INSERT INTO workspace_policies (workspace_id,profile_json,updated_at) VALUES (?,?,?)",
  )
    .bind(
      ctx.actor.workspaceId,
      JSON.stringify({ "record.page-parity.v1": "record-is-row" }),
      ctx.now,
    )
    .run();
  const result = await openRecord(ctx, record.value.pageId);
  expect(result.presentation.body).toBe(false);
  expect(result.page.page.id).toBe(record.value.pageId);
});
test("empty database accepts numeric formula, recomputes changed fields, rejects invalid types and cycles", async () => {
  const { ctx, containerId } = await scenario();
  const db = await createDatabase(ctx, {
    operationKey: "formula-empty-db",
    containerId,
    title: "Numbers",
  });
  const amount = await saveField(ctx, db.value.id, {
    operationKey: "formula-amount",
    expectedRevisionId: db.receipt.revisionId,
    field: {
      id: "amount",
      name: "Amount",
      type: "number",
      position: 0,
      config: {},
    },
  });
  const formula = await saveField(ctx, db.value.id, {
    operationKey: "formula-computed",
    expectedRevisionId: amount.receipt.revisionId,
    field: {
      id: "double",
      name: "Double",
      type: "formula",
      position: 1,
      config: {
        expression: {
          op: "multiply",
          args: [{ field: "amount" }, { literal: 2 }],
        },
      },
    },
  });
  const record = await createRecord(ctx, db.value.id, {
    operationKey: "formula-record",
    title: "Value",
    values: { amount: 3 },
  });
  expect((await openRecord(ctx, record.value.pageId)).values.double).toBe(6);
  await updateRecord(ctx, record.value.pageId, {
    operationKey: "formula-update",
    expectedRevisionId: record.receipt.revisionId,
    values: { amount: 8 },
  });
  expect((await openRecord(ctx, record.value.pageId)).values.double).toBe(16);
  await expect(
    saveField(ctx, db.value.id, {
      operationKey: "formula-invalid-type",
      expectedRevisionId: formula.receipt.revisionId,
      field: {
        id: "bad",
        name: "Bad",
        type: "formula",
        position: 2,
        config: {
          expression: {
            op: "add",
            args: [{ literal: "wrong" }, { literal: 2 }],
          },
        },
      },
    }),
  ).rejects.toMatchObject({ code: "FORMULA_TYPE" });
  await expect(
    saveField(ctx, db.value.id, {
      operationKey: "formula-cycle",
      expectedRevisionId: formula.receipt.revisionId,
      field: {
        id: "double",
        name: "Double",
        type: "formula",
        position: 1,
        config: { expression: { field: "double" } },
      },
    }),
  ).rejects.toMatchObject({ code: "FORMULA_CYCLE" });
});
test("Worker HTTP rejects missing expired revoked and denied sessions and persists authorized input", async () => {
  const { SELF } = await import("cloudflare:test");
  const { sessionFor } = await import("../../e2e/setup/fixtures");
  const { ctx, containerId, reader } = await scenario();
  const input = {
    operationKey: "http-db-created",
    containerId,
    title: "HTTP database",
  };
  const send = (cookie?: string) =>
    SELF.fetch("http://localhost/api/databases", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(input),
    });
  expect((await send()).status).toBe(401);
  expect(
    (
      await send(
        await sessionFor(ctx.actor.id, { expiresAt: "2020-01-01T00:00:00Z" }),
      )
    ).status,
  ).toBe(401);
  expect(
    (await send(await sessionFor(ctx.actor.id, { revokedAt: ctx.now }))).status,
  ).toBe(401);
  expect((await send(await sessionFor(reader.actor.id))).status).toBe(404);
  const cookie = await sessionFor(ctx.actor.id),
    response = await send(cookie);
  expect(response.status).toBe(201);
  const body = (await response.json()) as {
    value: {
      id: string;
    };
  };
  const read = await SELF.fetch(
    `http://localhost/api/databases/${body.value.id}`,
    { headers: { cookie } },
  );
  expect(read.status).toBe(200);
  expect(
    (
      (await read.json()) as {
        database: {
          id: string;
        };
      }
    ).database.id,
  ).toBe(body.value.id);
});
test("rollups filter related unreadable records before aggregate and reject stale references", async () => {
  const { ctx, containerId, reader } = await scenario();
  const db = await createDatabase(ctx, {
    operationKey: "rollup-db-create",
    containerId,
    title: "Relations",
  });
  let rev = (
    await saveField(ctx, db.value.id, {
      operationKey: "rollup-num-field",
      expectedRevisionId: db.receipt.revisionId,
      field: {
        id: "num",
        name: "Number",
        type: "number",
        config: {},
        position: 0,
      },
    })
  ).receipt.revisionId;
  rev = (
    await saveField(ctx, db.value.id, {
      operationKey: "rollup-rel-field",
      expectedRevisionId: rev,
      field: {
        id: "rel",
        name: "Related",
        type: "relation",
        config: { databaseId: db.value.id },
        position: 1,
      },
    })
  ).receipt.revisionId;
  await saveField(ctx, db.value.id, {
    operationKey: "rollup-sum-field",
    expectedRevisionId: rev,
    field: {
      id: "sum",
      name: "Sum",
      type: "rollup",
      config: { relationField: "rel", targetField: "num", calculation: "sum" },
      position: 2,
    },
  });
  const secret = await createRecord(ctx, db.value.id, {
    operationKey: "rollup-secret-record",
    title: "Private",
    values: { num: 100 },
  });
  await env.DB.prepare(
    "UPDATE pages SET lifecycle='draft',access_inheritance='restricted' WHERE id=?",
  )
    .bind(secret.value.pageId)
    .run();
  const visible = await createRecord(ctx, db.value.id, {
    operationKey: "rollup-visible-record",
    title: "Visible",
    values: { num: 2, rel: [secret.value.pageId] },
  });
  await seedPageGrant(db.value.pageId, {
    principalKind: "member",
    principalId: reader.actor.id,
    level: "view",
  });
  expect((await openRecord(ctx, visible.value.pageId)).values.sum).toBe(100);
  const filtered = await openRecord(reader, visible.value.pageId);
  expect(filtered.values.rel).toEqual([]);
  expect(filtered.values.sum).toBe(0);
  expect(filtered.page.properties.databaseFields?.rel).toEqual([]);
  expect(JSON.stringify(filtered)).not.toContain(secret.value.pageId);
});
test("all automation scopes persist; schedules deduplicate and chains throttle with a log", async () => {
  const { ctx, containerId } = await scenario();
  const db = await createDatabase(ctx, {
    operationKey: "scope-db-create",
    containerId,
    title: "Work",
  });
  for (const scope of ["source", "container", "site"] as const) {
    const result = await saveRule(ctx, {
      operationKey: `scope-create-${scope}`,
      name: scope,
      scope,
      sourceDatabaseId: scope === "source" ? db.value.id : undefined,
      containerId: scope === "container" ? containerId : undefined,
      trigger: { event: "created" },
      conditions: [],
      actions: [],
    });
    const e = {
      key: `chain-${scope}`,
      event: "created",
      databaseId: db.value.id,
      containerId,
      chainRuleIds: [result.value.id],
    };
    await enqueueAutomationEvent(ctx, e);
    const logs = await env.DB.prepare(
      "SELECT state FROM automation_runs WHERE rule_id=? AND state='throttled'",
    )
      .bind(result.value.id)
      .all();
    expect(logs.results).toHaveLength(1);
  }
  const { runAutomationSchedule } =
    await import("../../../src/core/features/automation/jobs");
  const scheduled = await saveRule(ctx, {
    operationKey: "scope-schedule-create",
    name: "Schedule",
    scope: "site",
    trigger: {
      event: "schedule",
      intervalMinutes: 60,
      startsAt: "2026-01-01T00:00:00Z",
    },
    conditions: [],
    actions: [{ type: "create-page", containerId, title: "Scheduled work" }],
  });
  await runAutomationSchedule(ctx, adapters);
  await runAutomationSchedule(ctx, adapters);
  const runs = await env.DB.prepare(
    "SELECT state FROM automation_runs WHERE rule_id=? AND state='success'",
  )
    .bind(scheduled.value.id)
    .all();
  expect(runs.results).toHaveLength(1);
});
test("rollup cycle writes reject while prior records remain readable", async () => {
  const { ctx, containerId } = await scenario();
  const db = await createDatabase(ctx, {
    operationKey: "cycle-db-create",
    containerId,
    title: "Cycles",
  });
  let rev = (
    await saveField(ctx, db.value.id, {
      operationKey: "cycle-rel-field",
      expectedRevisionId: db.receipt.revisionId,
      field: {
        id: "cycle-rel",
        name: "Related",
        type: "relation",
        config: { databaseId: db.value.id },
        position: 0,
      },
    })
  ).receipt.revisionId;
  const base = await saveField(ctx, db.value.id, {
    operationKey: "cycle-num-field",
    expectedRevisionId: rev,
    field: {
      id: "cycle-number",
      name: "Number",
      type: "number",
      config: {},
      position: 1,
    },
  });
  const a = await createRecord(ctx, db.value.id, {
    operationKey: "cycle-record-a",
    title: "A",
    values: { "cycle-number": 2 },
  });
  const b = await createRecord(ctx, db.value.id, {
    operationKey: "cycle-record-b",
    title: "B",
    values: { "cycle-rel": [a.value.pageId] },
  });
  await updateRecord(ctx, a.value.pageId, {
    operationKey: "cycle-record-link",
    expectedRevisionId: a.receipt.revisionId,
    values: { "cycle-rel": [b.value.pageId] },
  });
  const roll = await saveField(ctx, db.value.id, {
    operationKey: "cycle-roll-field",
    expectedRevisionId: base.receipt.revisionId,
    field: {
      id: "cycle-roll",
      name: "Roll",
      type: "rollup",
      config: {
        relationField: "cycle-rel",
        targetField: "cycle-number",
        calculation: "sum",
      },
      position: 2,
    },
  });
  await expect(saveField(ctx, db.value.id, {
    operationKey: "cycle-roll-recursive",
    expectedRevisionId: roll.receipt.revisionId,
    field: {
      id: "cycle-roll",
      name: "Roll",
      type: "rollup",
      config: {
        relationField: "cycle-rel",
        targetField: "cycle-roll",
        calculation: "sum",
      },
      position: 2,
    },
  })).rejects.toMatchObject({code:"COMPUTED_CYCLE"});
  expect((await openRecord(ctx, a.value.pageId)).values["cycle-roll"]).toBe(0);
});
test("all eight policy alternatives preserve structured data and template exclusions", async () => {
  const { ctx, containerId } = await scenario();
  const alternatives = {
    "page.lifecycle.v1": "draft-then-publish",
    "page.access.v1": "container-general",
    "page.public-access.v1": "link",
    "page.version.v1": "labelled",
    "page.status.v1": "open-vocabulary",
    "record.page-parity.v1": "record-is-row",
    "automation.scope.v1": "site",
    "container.access.v1": "grant-led",
  };
  await env.DB.prepare(
    "INSERT INTO workspace_policies (workspace_id,profile_json,updated_at) VALUES (?,?,?)",
  )
    .bind(ctx.actor.workspaceId, JSON.stringify(alternatives), ctx.now)
    .run();
  const db = await createDatabase(ctx, {
    operationKey: "all-policies-db",
    containerId,
    title: "Policy data",
  });
  const record = await createRecord(ctx, db.value.id, {
    operationKey: "all-policies-record",
    title: "Private",
    values: {},
  });
  const opened = await openRecord(ctx, record.value.pageId);
  expect(opened.page.policyProfile).toEqual(alternatives);
  expect(opened.page.page.lifecycle).toBe("draft");
  const tmpl = await saveTemplate(ctx, {
    operationKey: "all-policies-template",
    sourcePageId: record.value.pageId,
    includeChildren: false,
    containerId: null,
    title: "Copy",
    description: "",
    category: "Work",
  });
  const stored = await env.DB.prepare(
    "SELECT snapshot_json FROM knowledge_templates WHERE id=?",
  )
    .bind(tmpl.value.id)
    .first<{ snapshot_json: string }>();
  const snapshot = JSON.parse(stored!.snapshot_json);
  expect(snapshot.properties.statusKey).toBeUndefined();
  expect(snapshot.grants).toBeUndefined();
  expect(snapshot.revisions).toBeUndefined();
  expect(snapshot.publicExposure).toBeUndefined();
});
test("committed content events drain durably and self-triggering field rules are throttled", async () => {
  const { runAutomationMaintenance } =
    await import("../../../src/core/features/automation/events");
  const { ctx, containerId } = await scenario();
  const db = await createDatabase(ctx, {
    operationKey: "loop-db-create",
    containerId,
    title: "Loops",
  });
  await saveField(ctx, db.value.id, {
    operationKey: "loop-field-create",
    expectedRevisionId: db.receipt.revisionId,
    field: {
      id: "loop-num",
      name: "Number",
      type: "number",
      config: {},
      position: 0,
    },
  });
  const record = await createRecord(ctx, db.value.id, {
    operationKey: "loop-record-create",
    title: "Task",
    values: { "loop-num": 1 },
  });
  const rule = await saveRule(ctx, {
    operationKey: "loop-rule-create",
    name: "Update",
    scope: "source",
    sourceDatabaseId: db.value.id,
    trigger: { event: "record-updated" },
    conditions: [],
    actions: [{ type: "edit-fields", values: { "loop-num": 9 } }],
  });
  await updateRecord(ctx, record.value.pageId, {
    operationKey: "loop-record-update",
    expectedRevisionId: record.receipt.revisionId,
    values: { "loop-num": 3 },
  });
  await runAutomationMaintenance(ctx);
  await runAutomationMaintenance(ctx);
  const logs = await env.DB.prepare(
    "SELECT state FROM automation_runs WHERE rule_id=? AND state<>'configuration-changed' ORDER BY created_at,id",
  )
    .bind(rule.value.id)
    .all<{ state: string }>();
  expect(logs.results.filter((r) => r.state === "success")).toHaveLength(1);
  expect(logs.results.filter((r) => r.state === "throttled")).toHaveLength(1);
  expect((await openRecord(ctx, record.value.pageId)).values["loop-num"]).toBe(
    9,
  );
  await runAutomationMaintenance(ctx);
  expect(
    (await env.DB.prepare(
      "SELECT count(*) AS n FROM automation_runs WHERE rule_id=?",
    )
      .bind(rule.value.id)
      .first<{ n: number }>())!.n,
  ).toBe(3);
});
test("rule permission loss skips unauthorized later effects and retains confirmed receipt", async () => {
  const { sendNotification } =
    await import("../../../src/core/features/notifications/commands");
  const { ctx, containerId, reader } = await scenario();
  const db = await createDatabase(ctx, {
    operationKey: "loss-db-create",
    containerId,
    title: "Work",
  });
  const record = await createRecord(ctx, db.value.id, {
    operationKey: "loss-record-create",
    title: "Task",
    values: {},
  });
  await saveRule(ctx, {
    operationKey: "loss-rule-create",
    name: "Notify then comment",
    scope: "source",
    sourceDatabaseId: db.value.id,
    trigger: { event: "record-created" },
    conditions: [],
    actions: [
      {
        type: "notify",
        recipientMemberIds: [ctx.actor.id],
        message: "Started",
      },
      { type: "comment", body: "Must be blocked" },
    ],
  });
  const jobs = await enqueueAutomationEvent(ctx, {
    key: "loss-event",
    event: "record-created",
    pageId: record.value.pageId,
    databaseId: db.value.id,
    containerId,
  });
  const result = await processAutomationJob(ctx, jobs.jobIds[0], {
    ...adapters,
    notify: async (c, input) => {
      const response = await sendNotification(c, {
        operationKey: input.operationKey,
        pageId: input.sourcePageId,
        recipientIds: input.recipientMemberIds,
        outcome: input.message,
      });
      await env.DB.prepare(
        "UPDATE pages SET lifecycle='draft',author_member_id=?,access_inheritance='restricted' WHERE id=?",
      )
        .bind(reader.actor.id, record.value.pageId)
        .run();
      return response;
    },
  });
  expect(result?.state).toBe("success");
  const receipts = await env.DB.prepare(
    "SELECT state FROM automation_action_receipts WHERE run_id=? ORDER BY action_index",
  )
    .bind(result!.runId)
    .all<{ state: string }>();
  expect(receipts.results.map((r) => r.state)).toEqual([
    "confirmed",
    "skipped",
  ]);
  expect(
    (await env.DB.prepare(
      "SELECT count(*) AS n FROM comment_threads WHERE page_id=?",
    )
      .bind(record.value.pageId)
      .first<{ n: number }>())!.n,
  ).toBe(0);
});
test("draft profile record readers never see unpublished field values", async () => {
  const { publishPage } =
    await import("../../../src/core/features/lifecycle/service");
  const { ctx, containerId, reader } = await scenario();
  await env.DB.prepare(
    "INSERT INTO workspace_policies (workspace_id,profile_json,updated_at) VALUES (?,?,?)",
  )
    .bind(
      ctx.actor.workspaceId,
      JSON.stringify({ "page.lifecycle.v1": "draft-then-publish" }),
      ctx.now,
    )
    .run();
  const db = await createDatabase(ctx, {
    operationKey: "draft-db-create",
    containerId,
    title: "Drafts",
  });
  await saveField(ctx, db.value.id, {
    operationKey: "draft-field-create",
    expectedRevisionId: db.receipt.revisionId,
    field: {
      id: "draft-value",
      name: "Value",
      type: "number",
      config: {},
      position: 0,
    },
  });
  const record = await createRecord(ctx, db.value.id, {
    operationKey: "draft-record-create",
    title: "Record",
    values: { "draft-value": 2 },
  });
  await seedPageGrant(record.value.pageId, {
    principalKind: "member",
    principalId: reader.actor.id,
    level: "view",
  });
  const published = await publishPage(ctx, record.value.pageId, {
    operationKey: "draft-record-publish",
    expectedRevisionId: record.receipt.revisionId,
  });
  await updateRecord(ctx, record.value.pageId, {
    operationKey: "draft-record-change",
    expectedRevisionId: published.receipt.revisionId,
    values: { "draft-value": 99 },
  });
  expect(
    (await openRecord(ctx, record.value.pageId)).values["draft-value"],
  ).toBe(99);
  expect(
    (await openRecord(reader, record.value.pageId)).values["draft-value"],
  ).toBe(2);
});
test("views persist every layout, filter summaries, charts and independent embedded filters", async () => {
  const { chart } = await import("../../../src/core/features/databases/views");
  const { ctx, containerId } = await scenario();
  const db = await createDatabase(ctx, {
    operationKey: "view-db-create",
    containerId,
    title: "Layouts",
  });
  let rev = db.receipt.revisionId;
  for (const f of [
    {
      id: "v-status",
      name: "Status",
      type: "status" as const,
      config: { options: ["Open", "Done"] },
      position: 0,
    },
    {
      id: "v-date",
      name: "Date",
      type: "date" as const,
      config: {},
      position: 1,
    },
    {
      id: "v-number",
      name: "Number",
      type: "number" as const,
      config: {},
      position: 2,
    },
  ])
    rev = (
      await saveField(ctx, db.value.id, {
        operationKey: `view-field-${f.id}`,
        expectedRevisionId: rev,
        field: f,
      })
    ).receipt.revisionId;
  await createRecord(ctx, db.value.id, {
    operationKey: "view-record-open",
    title: "Open",
    values: { "v-status": "Open", "v-number": 3, "v-date": "2026-09-27" },
  });
  await createRecord(ctx, db.value.id, {
    operationKey: "view-record-done",
    title: "Done",
    values: { "v-status": "Done", "v-number": 9, "v-date": "2026-09-28" },
  });
  for (const [i, layout] of (
    ["table", "board", "list", "gallery", "calendar", "timeline"] as const
  ).entries()) {
    const saved = await saveView(ctx, db.value.id, {
      operationKey: `view-save-${layout}`,
      expectedRevisionId: rev,
      view: {
        id: `layout-${layout}`,
        name: layout,
        layout,
        filters: [],
        sorts: [{ field: "v-number", direction: "desc" }],
        groups: [{ field: "v-status", hideEmpty: true }],
        calculations: { "v-number": "sum" },
        display: { dateField: "v-date" },
        position: i,
      },
    });
    rev = saved.receipt.revisionId;
    const view = await queryView(ctx, db.value.id, `layout-${layout}`);
    expect(view.view.layout).toBe(layout);
    expect(view.calculations["v-number"]).toBe(12);
  }
  const embedded = await queryView(ctx, db.value.id, "layout-table", {
    pageId: db.value.pageId,
    filters: [{ field: "v-status", op: "eq", value: "Open" }],
  });
  expect(embedded.calculations["v-number"]).toBe(3);
  expect(
    (await queryView(ctx, db.value.id, "layout-table")).records,
  ).toHaveLength(2);
  expect(
    (
      await chart(
        ctx,
        db.value.id,
        "layout-table",
        "v-status",
        "v-number",
        "sum",
      )
    ).series,
  ).toEqual(
    expect.arrayContaining([
      { label: "Open", value: 3 },
      { label: "Done", value: 9 },
    ]),
  );
});
test("template attachments are immutable independent copies and remain readable after source removal", async () => {
  const { uploadMedia } =
    await import("../../../src/core/features/media/service");
  const { replaceBlocks } =
    await import("../../../src/core/features/editor/service");
  const { previewTemplate, templateAsset } =
    await import("../../../src/core/features/templates/service");
  const { ctx, containerId } = await scenario();
  const source = await createPage(ctx, {
    operationKey: "asset-source-page",
    containerId,
    title: "Media template",
  });
  const file = await uploadMedia(ctx, {
    operationKey: "asset-source-upload",
    pageId: source.value.pageId,
    name: "guide.txt",
    contentType: "text/plain",
    bytes: new TextEncoder().encode("Independent retained attachment"),
  });
  const current = await readPage(ctx, source.value.pageId);
  await replaceBlocks(ctx, source.value.pageId, {
    operationKey: "asset-source-blocks",
    expectedRevisionId: current.page.revisionId,
    blocks: [
      {
        id: "source-asset-block",
        blockType: "media",
        treePosition: "1",
        content: {
          kind: "file",
          source: {
            fileId: file.value.id,
            url: file.value.url,
            name: "guide.txt",
            contentType: "text/plain",
          },
          caption: "Guide",
          alt: "",
        },
      },
    ],
  });
  const template = await saveTemplate(ctx, {
    operationKey: "asset-template-save",
    sourcePageId: source.value.pageId,
    includeChildren: false,
    containerId: null,
    title: "Media",
    description: "",
    category: "Work",
  });
  const stored = await env.DB.prepare(
    "SELECT storage_key FROM files WHERE id=?",
  )
    .bind(file.value.id)
    .first<{ storage_key: string }>();
  await env.FILES.delete(stored!.storage_key);
  await env.DB.prepare("UPDATE files SET deleted_at=? WHERE id=?")
    .bind(ctx.now, file.value.id)
    .run();
  expect(
    await (await templateAsset(ctx, template.value.id, file.value.id)).text(),
  ).toBe("Independent retained attachment");
  const applied = await applyTemplate(ctx, template.value.id, {
    operationKey: "asset-template-apply",
    containerId,
    expectedRevisionId: template.receipt.revisionId,
  });
  const result = await readPage(ctx, applied.value.pageId);
  const content = result.blocks[0].content as { source: { fileId: string } };
  expect(content.source.fileId).not.toBe(file.value.id);
  const copied = await env.DB.prepare(
    "SELECT storage_key FROM files WHERE id=? AND page_id=?",
  )
    .bind(content.source.fileId, applied.value.pageId)
    .first<{ storage_key: string }>();
  expect(await (await env.FILES.get(copied!.storage_key))!.text()).toBe(
    "Independent retained attachment",
  );
});
test("retained imported formulas remain labelled and do not block later schema edits", async () => {
  const { ctx, containerId } = await scenario();
  const db = await createDatabase(ctx, {
    operationKey: "retained-db-create",
    containerId,
    title: "Imported",
  });
  await env.DB.prepare(
    "INSERT INTO database_fields (id,database_id,name,field_type,config_json,position,created_at,updated_at,revision_id) VALUES (?,?,?,'formula',?,0,?,?,?)",
  )
    .bind(
      "retained-formula",
      db.value.id,
      "Imported calculation",
      JSON.stringify({ rawConfiguration: "provider expression" }),
      ctx.now,
      ctx.now,
      "retained-field-rev",
    )
    .run();
  const record = await createRecord(ctx, db.value.id, {
    operationKey: "retained-record-create",
    title: "Imported",
    values: {},
  });
  await env.DB.prepare(
    "UPDATE database_records SET field_values_json=? WHERE page_id=?",
  )
    .bind(JSON.stringify({ "retained-formula": 42 }), record.value.pageId)
    .run();
  await saveField(ctx, db.value.id, {
    operationKey: "retained-add-field",
    expectedRevisionId: db.receipt.revisionId,
    field: {
      id: "retained-new",
      name: "New field",
      type: "text",
      config: {},
      position: 1,
    },
  });
  const opened = await openRecord(ctx, record.value.pageId);
  expect(opened.values["retained-formula"]).toBe(42);
  expect(
    opened.fields.find((f) => f.id === "retained-formula")?.evaluationState,
  ).toBe("retained-not-recomputed");
});
test("database navigation and reference hydration expose actual permitted labels only", async () => {
  const { listDatabases, resolveReferences, referenceOptions } =
    await import("../../../src/core/features/databases/discovery");
  const { ctx, containerId, reader } = await scenario();
  const db = await createDatabase(ctx, {
    operationKey: "reference-db-create",
    containerId,
    title: "Readable work",
  });
  const visible = await createRecord(ctx, db.value.id, {
    operationKey: "reference-visible",
    title: "Named record",
    values: {},
  });
  const secret = await createRecord(ctx, db.value.id, {
    operationKey: "reference-secret",
    title: "Hidden record",
    values: {},
  });
  await env.DB.prepare(
    "UPDATE pages SET lifecycle='draft',access_inheritance='restricted' WHERE id=?",
  )
    .bind(secret.value.pageId)
    .run();
  expect((await listDatabases(reader)).items).toHaveLength(0);
  await seedPageGrant(db.value.pageId, {
    principalKind: "member",
    principalId: reader.actor.id,
    level: "view",
  });
  expect((await listDatabases(reader)).items.map((d) => d.title)).toEqual([
    "Readable work",
  ]);
  const labels = await resolveReferences(reader, {
    memberIds: [ctx.actor.id],
    pageIds: [visible.value.pageId, secret.value.pageId],
  });
  expect(labels.items.map((r) => r.label)).toEqual(["Owner", "Named record"]);
  await saveField(ctx, db.value.id, {
    operationKey: "reference-rel-field",
    expectedRevisionId: db.receipt.revisionId,
    field: {
      id: "reference-rel",
      name: "Related",
      type: "relation",
      config: { databaseId: db.value.id },
      position: 0,
    },
  });
  expect(
    (
      await referenceOptions(reader, db.value.id, "reference-rel", "Named")
    ).items.map((r) => r.label),
  ).toEqual(["Named record"]);
});
