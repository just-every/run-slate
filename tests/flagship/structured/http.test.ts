import { env } from "cloudflare:test";
import { beforeEach, test, expect } from "vitest";
import { resetDeployment } from "../../e2e/setup/reset-deployment";
import {
  seedWorkspace,
  seedMember,
  seedContainer,
  seedContainerGrant,
} from "../../e2e/setup/fixtures";
import type { FeatureContext } from "../../../src/core/app/feature-context";

// Keep SELF module loading isolated from direct-service request contexts.
beforeEach(resetDeployment);

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

test("Worker HTTP rejects missing expired revoked and denied sessions and persists authorized input", async () => {
  const { SELF } = await import("cloudflare:test");
  const { sessionFor } = await import("../../e2e/setup/fixtures");
  const { ctx, containerId, reader } = await scenario();
  const input = {
    operationKey: "case:031",
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

  // Follow the same native session into a populated record, including the
  // allowed edit, computed-field refusal and subsequent viewer downgrade.
  const call = async (method: string, path: string, actor = cookie, data?: unknown) => {
    const response = await SELF.fetch(`http://localhost/api${path}`, {
      method, headers: {cookie: actor, origin: "http://localhost", "content-type": "application/json"},
      ...(data ? {body: JSON.stringify(data)} : {}),
    });
    return {status: response.status, body: await response.json() as any};
  };
  let operation = 0;
  const mutate = async (method: string, path: string, data: object, actor = cookie) => {
    const result = await call(method, path, actor, {operationKey: `case:record-detail-${++operation}`, ...data});
    expect(result.status, JSON.stringify(result.body)).toBeLessThan(300);
    return result.body.value;
  };
  const base = `/databases/${body.value.id}`;
  const definitions = [
    {id: "notes", name: "Notes", type: "text", config: {}, position: 2},
    {id: "quantity", name: "Quantity", type: "number", config: {}, position: 0},
    {id: "double", name: "Double quantity", type: "formula", config: {expression: {op: "multiply", args: [{field: "quantity"}, {literal: 2}]}}, position: 1},
    {id: "created", name: "Created", type: "created-at", config: {}, position: 3},
    {id: "updated", name: "Updated", type: "updated-at", config: {}, position: 4},
    {id: "identifier", name: "Record identifier", type: "identifier", config: {}, position: 5},
  ];
  let structure = (await call("GET", base)).body.database.revision_id;
  for (const field of definitions) structure = (await mutate("POST", base + "/fields", {expectedRevisionId: structure, field})).revisionId;
  const record = await mutate("POST", base + "/records", {title: "Populated record", values: {notes: "Retained notes", quantity: 7}});
  const recordPath = base + "/records/" + record.pageId;
  await mutate("PUT", `/pages/${record.pageId}/blocks`, {expectedRevisionId: record.revisionId,
    blocks: [{id: "record-body", blockType: "paragraph", treePosition: "a", content: {text: [{text: "Original retained record body"}]}}]});
  const earlier = (await call("GET", recordPath)).body;
  await mutate("POST", `/comments/page/${record.pageId}`, {body: [{text: "Retained record discussion"}]});
  await mutate("POST", "/sharing", {targetKind: "page", targetId: (await call("GET", base)).body.database.page_id, principalKind: "member", principalId: reader.actor.id, level: "edit"});
  const memberCookie = await sessionFor(reader.actor.id);
  const opened = (await call("GET", recordPath, memberCookie)).body;
  expect(opened.fields.map((field: any) => field.id)).toEqual(["quantity", "double", "notes", "created", "updated", "identifier"]);
  expect(opened.fields.filter((field: any) => field.editable).map((field: any) => field.id)).toEqual(["quantity", "notes"]);
  expect(opened.values).toMatchObject({quantity: 7, double: 14, notes: "Retained notes", identifier: record.pageId});
  const edit = {operationKey: "case:record-inline-edit", expectedRevisionId: opened.revisionId, values: {quantity: 11}};
  expect((await call("PATCH", recordPath, memberCookie, edit)).status).toBe(200);
  const edited = (await call("GET", recordPath, memberCookie)).body;
  expect(edited.values).toMatchObject({quantity: 11, double: 22, notes: "Retained notes"});
  for (const values of [{double: 99}, {created: "2026-01-01"}, {updated: "2026-01-01"}, {identifier: "other-record"}]) {
    const denied = await call("PATCH", recordPath, memberCookie, {operationKey: `case:readonly-${++operation}`, expectedRevisionId: edited.revisionId, values});
    expect(denied.status).toBe(400);
    expect(denied.body.code).toBe("double" in values ? "COMPUTED_FIELD" : "READ_ONLY_FIELD");
    expect((await call("GET", recordPath, memberCookie)).body).toEqual(edited);
  }
  const dbPage = (await call("GET", base)).body.database.page_id;
  const memberGrant = (await call("GET", `/sharing/pages/${dbPage}`)).body.items.find((item: any) => item.principalId === reader.actor.id);
  await mutate("POST", "/sharing", {id: memberGrant.id, targetKind: "page", targetId: dbPage, principalKind: "member", principalId: reader.actor.id, level: "view"});
  const viewer = (await call("GET", recordPath, memberCookie)).body;
  expect(viewer.fields.every((field: any) => !field.editable)).toBe(true);
  expect(viewer.values).toEqual(edited.values);
  const history = (await call("GET", `/revisions/${record.pageId}`, memberCookie)).body;
  expect(history.items.some((item: any) => item.id === earlier.revisionId)).toBe(true);
  const exact = (await call("GET", `/revisions/${record.pageId}/${earlier.revisionId}`, memberCookie)).body;
  expect(exact.properties.databaseFields.quantity).toBe(7);
  expect(exact.blocks[0].content.text[0].text).toBe("Original retained record body");
  expect((await call("GET", `/comments/page/${record.pageId}`, memberCookie)).body.comments[0].body[0].text).toBe("Retained record discussion");
  expect((await call("PATCH", recordPath, memberCookie, {...edit, operationKey: "case:viewer-record-write", expectedRevisionId: viewer.revisionId, values: {quantity: 99}})).status).toBe(404);
  expect((await call("PATCH", recordPath, memberCookie, edit)).status).toBe(404);
  expect((await call("GET", recordPath, memberCookie)).body).toEqual(viewer);
  expect((await call("GET", `/revisions/${record.pageId}`)).body).toEqual(history);
  const workspace = (await call("GET", "/workspace")).body;
  for (const parity of ["record-is-row", "record-is-page"]) {
    const current = (await call("GET", "/workspace")).body;
    const {name, mark, description, guestAccess, publicLinkAccess, anonymousAccess} = current;
    await mutate("PUT", "/workspace", {expectedRevisionId: current.revisionId, name, mark, description, guestAccess, publicLinkAccess, anonymousAccess,
      policies: {...workspace.policies, "record.page-parity.v1": parity}});
    const retained = (await call("GET", recordPath, memberCookie)).body;
    expect(retained.parity).toBe(parity);
    expect(retained.presentation.body).toBe(parity === "record-is-page");
    expect(retained.page.blocks).toEqual(edited.page.blocks);
    expect(retained.values).toEqual(edited.values);
  }
  await mutate("POST", "/sharing", {id: memberGrant.id, targetKind: "page", targetId: dbPage, principalKind: "member", principalId: reader.actor.id, level: "edit"});
  // A relation is a retained target identity, selected under each native reader's grants.
  const target = await mutate("POST", "/databases", {containerId, title: "Relation targets"});
  const targetBase = `/databases/${target.id}`;
  const first = await mutate("POST", targetBase + "/records", {title: "First actual target", values: {}});
  const second = await mutate("POST", targetBase + "/records", {title: "Second actual target", values: {}});
  const ordinary = await mutate("POST", "/pages", {containerId, title: "An ordinary page"});
  await mutate("POST", "/sharing", {targetKind: "page", targetId: target.pageId, principalKind: "member", principalId: reader.actor.id, level: "view"});
  await mutate("POST", "/sharing", {targetKind: "page", targetId: ordinary.pageId, principalKind: "member", principalId: reader.actor.id, level: "view"});
  const relation = {id: "related", name: "Related records", type: "relation", position: 6, config: {databaseId: target.id}};
  await mutate("POST", base + "/fields", {expectedRevisionId: (await call("GET", base)).body.database.revision_id, field: relation});
  const optionsPath = base + "/references/related";
  const choices = (await call("GET", optionsPath, memberCookie)).body.items;
  expect(choices).toEqual([
    {id: first.pageId, label: "First actual target", kind: "record", url: `/app/databases/${target.id}/records/${first.pageId}`},
    {id: second.pageId, label: "Second actual target", kind: "record", url: `/app/databases/${target.id}/records/${second.pageId}`},
  ].sort((a, b) => a.id.localeCompare(b.id)));
  const writeRelation = async (ids: string[]) => {
    const current = (await call("GET", recordPath, memberCookie)).body;
    return mutate("PATCH", recordPath, {expectedRevisionId: current.revisionId, values: {related: ids}}, memberCookie);
  };
  await writeRelation([]);
  expect((await call("GET", recordPath, memberCookie)).body.values.related).toEqual([]);
  const selected = [first.pageId, second.pageId];
  const selectionInput = {operationKey: "case:retained-relation", expectedRevisionId: (await call("GET", recordPath, memberCookie)).body.revisionId, values: {related: selected}};
  expect((await call("PATCH", recordPath, memberCookie, selectionInput)).status).toBe(200);
  expect((await call("GET", recordPath, memberCookie)).body.values.related).toEqual(selected);
  const firstPage = (await call("GET", `/pages/${first.pageId}`)).body;
  await mutate("PATCH", `/pages/${first.pageId}`, {expectedRevisionId: firstPage.page.revisionId, properties: {title: "Renamed actual target"}});
  const hydrated = (await call("POST", "/databases/references", memberCookie, {pageIds: selected})).body.items;
  expect(hydrated.find((item: any) => item.id === first.pageId)).toEqual({id: first.pageId, label: "Renamed actual target", kind: "record", url: `/app/databases/${target.id}/records/${first.pageId}`});
  expect((await call("GET", `${targetBase}/records/${first.pageId}`, memberCookie)).body.page.page.title).toBe("Renamed actual target");
  expect((await call("GET", recordPath, memberCookie)).body.values.related).toEqual(selected);
  const snapshot = async () => ({
    record: (await call("GET", recordPath)).body,
    page: (await call("GET", `/pages/${record.pageId}`)).body,
    history: (await call("GET", `/revisions/${record.pageId}`)).body,
    structure: (await call("GET", base)).body,
    activity: (await call("GET", "/activity?limit=100")).body,
  });
  for (const [bad, status, code] of [["missing-record", 404, "NOT_FOUND"], [ordinary.pageId, 400, "INVALID_RELATION"], [record.pageId, 400, "INVALID_RELATION"]] as const) {
    const before = await snapshot();
    const refused = await call("PATCH", recordPath, memberCookie, {operationKey: `case:bad-relation-${++operation}`, expectedRevisionId: before.record.revisionId, values: {related: [first.pageId, bad]}});
    expect(refused.status, JSON.stringify(refused.body)).toBe(status);
    expect(refused.body.code).toBe(code);
    expect(await snapshot()).toEqual(before);
  }
  // Restrict one real target, then revoke the independently signed-in reader.
  await mutate("POST", "/sharing", {targetKind: "page", targetId: second.pageId, principalKind: "member", principalId: ctx.actor.id, level: "full"});
  const targetGrant = await mutate("POST", "/sharing", {targetKind: "page", targetId: second.pageId, principalKind: "member", principalId: reader.actor.id, level: "view"});
  await mutate("PUT", `/sharing/pages/${second.pageId}/inheritance`, {expectedRevisionId: (await call("GET", `/pages/${second.pageId}`)).body.page.revisionId, restricted: true});
  expect((await call("GET", recordPath, memberCookie)).body.values.related).toEqual(selected);
  await mutate("POST", "/sharing", {id: targetGrant.id, targetKind: "page", targetId: second.pageId, principalKind: "member", principalId: reader.actor.id, level: "view", revoke: true});
  const retainedAfterRevocation = await snapshot();
  const safeReader = (await call("GET", recordPath, memberCookie)).body;
  expect(safeReader.values.related).toEqual([first.pageId]);
  expect(JSON.stringify(safeReader)).not.toContain(second.pageId);
  expect(JSON.stringify(safeReader)).not.toContain("Second actual target");
  expect((await call("GET", optionsPath, memberCookie)).body.items).toEqual([{id: first.pageId, label: "Renamed actual target", kind: "record", url: `/app/databases/${target.id}/records/${first.pageId}`}]);
  expect((await call("POST", "/databases/references", memberCookie, {pageIds: selected})).body.items.map((item: any) => item.id)).toEqual([first.pageId]);
  expect((await call("GET", `${targetBase}/records/${second.pageId}`, memberCookie)).status).toBe(404);
  const refused = await call("PATCH", recordPath, memberCookie, {operationKey: "case:revoked-relation", expectedRevisionId: retainedAfterRevocation.record.revisionId, values: {related: selected}});
  expect(refused.status).toBe(404);
  expect(refused.body.code).toBe("NOT_FOUND");
  const replay = await call("PATCH", recordPath, memberCookie, selectionInput);
  expect(replay.status).toBe(200);
  expect(replay.body.value.values.related).toEqual([first.pageId]);
  expect(JSON.stringify(replay.body)).not.toContain(second.pageId);
  expect(await snapshot()).toEqual(retainedAfterRevocation);
  expect(retainedAfterRevocation.record.values.related).toEqual(selected);
  // Repointing a populated relation must not turn retained identities into wrong-database links.
  const beforeRetarget = await snapshot();
  const retarget = await call("POST", base + "/fields", cookie, {operationKey: "case:retarget-relation", expectedRevisionId: beforeRetarget.structure.database.revision_id, field: {...relation, config: {databaseId: body.value.id}}});
  expect(retarget.status).toBe(409);
  expect(retarget.body.code).toBe("FIELD_DATA_LOSS");
  expect(await snapshot()).toEqual(beforeRetarget);
  await writeRelation([]);
  const cleared = (await call("GET", recordPath)).body;
  await mutate("POST", base + "/fields", {expectedRevisionId: (await call("GET", base)).body.database.revision_id, field: {...relation, config: {databaseId: body.value.id}}});
  expect((await call("GET", base)).body.fields.find((field: any) => field.id === relation.id).config.databaseId).toBe(body.value.id);
  expect((await call("GET", recordPath)).body).toEqual({...cleared, fields: cleared.fields.map((field: any) => field.id === relation.id ? {...field, config: {databaseId: body.value.id}} : field)});



  await chartHttpJourney({call, mutate, cookie, memberCookie, readerId: reader.actor.id, ownerId: ctx.actor.id, containerId});
}, 90_000);

test("database file references list only attachments the reader could open", async () => {
  const { SELF } = await import("cloudflare:test");
  const { sessionFor } = await import("../../e2e/setup/fixtures");
  const { createPage } = await import("../../../src/core/features/pages/service");
  const { uploadMedia } = await import("../../../src/core/features/media/service");
  const { ctx, containerId, reader } = await scenario();
  await seedContainerGrant(containerId, { principalKind: "member", principalId: reader.actor.id, level: "view" });
  const owner = await sessionFor(ctx.actor.id), viewer = await sessionFor(reader.actor.id);
  const call = async (method: string, path: string, cookie: string, body?: unknown) => {
    const response = await SELF.fetch(`http://localhost/api${path}`, { method, headers: { cookie, origin: "http://localhost", ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    return { status: response.status, text, data: text ? JSON.parse(text) : null };
  };
  const db = (await call("POST", "/databases", owner, { operationKey: "case:file-references-db", containerId, title: "Vendor files" })).data.value;
  expect((await call("POST", `/databases/${db.id}/fields`, owner, { operationKey: "case:file-references-field", expectedRevisionId: db.revisionId, field: { id: "attachment", name: "Attachment", type: "file", config: {}, position: 0 } })).status).toBeLessThan(300);
  const page = await createPage(ctx, { operationKey: "case:file-references-page", containerId, title: "Vendor notes" });
  const hidden = await uploadMedia(ctx, { operationKey: "case:file-references-upload", pageId: page.value.pageId, name: "unreleased-pricing.txt", contentType: "text/plain", bytes: new TextEncoder().encode("synthetic-slate-unreleased") });
  expect((await call("GET", `/media/${hidden.value.id}`, viewer)).status).toBe(404);
  const options = await call("GET", `/databases/${db.id}/references/attachment`, viewer);
  expect(options.status, options.text).toBe(200);
  expect(options.text).not.toContain("unreleased-pricing.txt");
  const resolved = await call("POST", "/databases/references", viewer, { fileIds: [hidden.value.id] });
  expect(resolved.status, resolved.text).toBe(200);
  expect(resolved.text).not.toContain("unreleased-pricing.txt");
  expect((await call("GET", `/databases/${db.id}/references/attachment`, owner)).text).toContain("unreleased-pricing.txt");
});


/** Native chart and saved-view reads share current session and record authority. */
async function chartHttpJourney({call, mutate, cookie, memberCookie, readerId, ownerId, containerId}: any) {
  const current = (await call("GET", "/workspace")).body;
  const {name, mark, description, guestAccess, publicLinkAccess, anonymousAccess} = current;
  await mutate("PUT", "/workspace", {expectedRevisionId: current.revisionId, name, mark, description, guestAccess, publicLinkAccess, anonymousAccess,
    policies: {...current.policies, "page.lifecycle.v1": "always-live"}});
  const created = await mutate("POST", "/databases", {containerId, title: "Native chart source"});
  const base = `/databases/${created.id}`;
  let revision = created.revisionId;
  for (const field of [
    {id: "chart-stage", name: "Stage", type: "status", config: {options: ["Open", "Closed"]}, position: 0},
    {id: "chart-amount", name: "Amount", type: "number", config: {}, position: 1},
    {id: "chart-included", name: "Included", type: "checkbox", config: {}, position: 2},
  ]) revision = (await mutate("POST", base + "/fields", {expectedRevisionId: revision, field})).revisionId;
  const source = {id: "chart-filtered", name: "Included native work", layout: "table", filters: [{field: "chart-included", op: "eq", value: true}], sorts: [{field: "$title", direction: "asc"}], groups: [], calculations: {}, display: {}, position: 0};
  revision = (await mutate("POST", base + "/views", {expectedRevisionId: revision, view: source})).revisionId;
  const rows: any[] = [];
  for (const [title, stage, amount, included, restricted] of [
    ["A shared", "Open", 10, true, false], ["B shared", "Open", 20, true, false],
    ["C shared", "Closed", 30, true, false], ["D excluded", "Closed", 500, false, false],
    ["E private", "Open", 100, true, true], ["F empty measure", "Closed", null, true, false],
    ["G empty group", null, 15, true, false],
  ]) {
    const record = await mutate("POST", base + "/records", {title, values: {"chart-stage": stage, "chart-amount": amount, "chart-included": included}});
    if (restricted) {
      await mutate("POST", "/sharing", {targetKind: "page", targetId: record.pageId, principalKind: "member", principalId: ownerId, level: "full"});
      const page = (await call("GET", `/pages/${record.pageId}`)).body;
      await mutate("PUT", `/sharing/pages/${record.pageId}/inheritance`, {expectedRevisionId: page.page.revisionId, restricted: true});
    }
    rows.push({...record, title, included, restricted});
  }
  const path = `${base}/views/${source.id}`;
  expect((await call("GET", path + "/chart?group=chart-stage", memberCookie)).status).toBe(404);
  const grant = await mutate("POST", "/sharing", {targetKind: "page", targetId: created.pageId, principalKind: "member", principalId: readerId, level: "view"});
  for (const actor of [cookie, memberCookie]) {
    const result = await call("GET", path, actor);
    expect(result.status).toBe(200);
    expect(result.body.records.map((record: any) => record.pageId)).toEqual(rows.filter(row => row.included && (actor === cookie || !row.restricted)).map(row => row.pageId));
    for (const calculation of ["count", "sum", "average", "minimum", "maximum"]) {
      const buckets = new Map<string, (number | null)[]>();
      for (const record of result.body.records) {
        const key = JSON.stringify(record.values["chart-stage"] ?? null);
        buckets.set(key, [...(buckets.get(key) ?? []), record.values["chart-amount"]]);
      }
      const expected = [...buckets].map(([label, values]) => {
        const numbers = values.filter((value): value is number => typeof value === "number");
        const sum = numbers.reduce((total, value) => total + value, 0);
        return {label: JSON.parse(label), value: calculation === "count" ? values.length : calculation === "sum" ? sum : calculation === "average" ? (numbers.length ? sum / numbers.length : null) : calculation === "minimum" ? (numbers.length ? Math.min(...numbers) : null) : (numbers.length ? Math.max(...numbers) : null)};
      });
      const chart = await call("GET", path + `/chart?group=chart-stage&numeric=${calculation === "count" ? "" : "chart-amount"}&calculation=${calculation}`, actor);
      expect(chart.status).toBe(200);
      expect(chart.body).toEqual({viewId: source.id, viewName: source.name, series: expected});
    }
  }
  source.name = "Renamed native source";
  source.filters.push({field: "chart-stage", op: "eq", value: "Open"} as any);
  await mutate("POST", base + "/views", {expectedRevisionId: revision, view: source});
  const renamed = await call("GET", path + "/chart?group=chart-stage&numeric=chart-amount&calculation=sum", memberCookie);
  expect(renamed.body).toEqual({viewId: source.id, viewName: source.name, series: [{label: "Open", value: 30}]});
  const before = (await call("GET", path)).body;
  await mutate("POST", "/sharing", {id: grant.id, targetKind: "page", targetId: created.pageId, principalKind: "member", principalId: readerId, level: "view", revoke: true});
  for (const route of [path, path + "/chart?group=chart-stage&numeric=chart-amount&calculation=sum"]) {
    const refused = await call("GET", route, memberCookie);
    expect(refused.status).toBe(404);
    expect(JSON.stringify(refused.body)).not.toContain(source.name);
  }
  expect((await call("GET", path)).body).toEqual(before);
  const {sessionFor} = await import("../../e2e/setup/fixtures");
  const revoked = await sessionFor(ownerId, {revokedAt: new Date().toISOString()});
  expect((await call("GET", path + "/chart?group=chart-stage", revoked)).status).toBe(401);
}
