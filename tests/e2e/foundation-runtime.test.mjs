import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyMigrations,
  countRows,
  executeD1,
  signInLocally,
  startViteRuntime,
  stop,
} from "./runtime-harness.mjs";

const sampleWorkspaceId = "01JBF2JH4M0D3S8ZJ1TQW7K0A1";
const sampleOwnerMemberId = "01JBF2JH4M0D3S8ZJ1TQW7K0B1";

test("the development Worker serves the Start documents and the Hono families", { timeout: 180000 }, async () => {
  const persistPath = await mkdtemp(path.join(os.tmpdir(), "slate-foundation-"));
  let runtime;

  try {
    await applyMigrations(persistPath);
    runtime = await startViteRuntime(persistPath);
    const { baseUrl } = runtime;

    // Hono: health reports only the dependencies it actually round-tripped.
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      status: "ok",
      checks: { database: { status: "reachable" }, files: { status: "reachable" } },
    });

    // Start: HOME-001 renders the buyer identity in the first HTML response.
    const landing = await fetch(baseUrl);
    assert.equal(landing.status, 200);
    assert.match(landing.headers.get("content-type") ?? "", /text\/html/);
    const landingHtml = await landing.text();
    assert.match(landingHtml, /<html lang="en">/);
    assert.match(landingHtml, /<h1[^>]*>Slate<\/h1>/);
    assert.doesNotMatch(landingHtml, /Jamie Park|jamie@aurora.example/);
    assert.match(landingHtml, /Sign in to workspace/);

    const signInDocument = await fetch(`${baseUrl}/signin`);
    assert.equal(signInDocument.status, 200);
    assert.match(await signInDocument.text(), /Your workspace is private\./);

    // Nothing is seeded until a loopback sign-in asks for it.
    assert.equal(await countRows(persistPath, "workspaces"), 0);

    // The native anonymous operator-document response, with a safe next path.
    const anonymousApp = await fetch(`${baseUrl}/app/containers/x?tab=1`, { redirect: "manual" });
    assert.equal(anonymousApp.status, 302);
    assert.equal(anonymousApp.headers.get("location"), "/signin?next=%2Fapp%2Fcontainers%2Fx%3Ftab%3D1");
    assert.equal((await anonymousApp.text()).length, 0);

    const escapingNext = await fetch(`${baseUrl}/app`, { redirect: "manual", headers: { "sec-fetch-mode": "navigate" } });
    assert.equal(escapingNext.status, 302);
    assert.equal(escapingNext.headers.get("location"), "/signin?next=%2Fapp");

    const malformedSignIn = await fetch(`${baseUrl}/api/auth/local-sign-in`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    assert.equal(malformedSignIn.status, 400);
    assert.equal(await countRows(persistPath, "workspaces"), 0);

    const { cookie, body } = await signInLocally(baseUrl);
    assert.equal(body.next, "/app");
    assert.equal(body.member.email, "jamie@aurora.example");
    assert.equal(body.member.role, "owner");
    assert.ok(cookie.startsWith("slate_session="));
    assert.equal(await countRows(persistPath, "workspaces"), 1);
    assert.equal(await countRows(persistPath, "members"), 3);

    // The authenticated operator document renders the member's identity server-side.
    const operatorDocument = await fetch(`${baseUrl}/app`, { headers: { cookie } });
    assert.equal(operatorDocument.status, 200);
    const operatorHtml = await operatorDocument.text();
    assert.match(operatorHtml, /data-testid="member-name">Jamie Park</);
    assert.match(operatorHtml, /data-testid="workspace-name">Aurora Android Launch</);
    assert.match(operatorHtml, /data-testid="workspace-empty-state"/);
    assert.match(operatorHtml, /data-testid="nav-workspace"/);

    // Changed D1 changes the next first HTML response: this document is SSR, not a snapshot.
    await executeD1(persistPath, `UPDATE members SET display_name = 'Jamie Renamed' WHERE id = '${sampleOwnerMemberId}'`);
    const renamedHtml = await (await fetch(`${baseUrl}/app`, { headers: { cookie } })).text();
    assert.match(renamedHtml, /data-testid="member-name">Jamie Renamed</);
    assert.doesNotMatch(renamedHtml, /Jamie Park/);
    await executeD1(persistPath, `UPDATE members SET display_name = 'Jamie Park' WHERE id = '${sampleOwnerMemberId}'`);

    // A protected API namespace authenticates before it matches a route.
    const anonymousUnknownApi = await fetch(`${baseUrl}/api/does-not-exist`);
    assert.equal(anonymousUnknownApi.status, 401);
    assert.equal((await anonymousUnknownApi.json()).code, "UNAUTHENTICATED");

    const authenticatedUnknownApi = await fetch(`${baseUrl}/api/does-not-exist`, { headers: { cookie } });
    assert.equal(authenticatedUnknownApi.status, 404);
    assert.equal((await authenticatedUnknownApi.json()).code, "NOT_FOUND");

    const knownApi = await fetch(`${baseUrl}/api/session`, { headers: { cookie } });
    assert.equal(knownApi.status, 200);
    assert.equal((await knownApi.json()).member.id, sampleOwnerMemberId);

    // `/p/*` is reserved for the WEB family and answers a real 404 until it ships.
    for (const publishedPath of ["/p", "/p/a-page"]) {
      const published = await fetch(`${baseUrl}${publishedPath}`);
      assert.equal(published.status, 404, publishedPath);
      assert.equal((await published.json()).code, "NOT_FOUND");
    }

    // An unknown document is a real 404, not the application shell.
    const unknownDocument = await fetch(`${baseUrl}/nothing-here`);
    assert.equal(unknownDocument.status, 404);
    assert.match(await unknownDocument.text(), /Not found/);

    // Revoking a session is observable on every protected surface.
    const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: { cookie, origin: baseUrl } });
    assert.equal(logout.status, 204);
    assert.equal((await fetch(`${baseUrl}/api/session`, { headers: { cookie } })).status, 401);
    const revokedApp = await fetch(`${baseUrl}/app`, { headers: { cookie }, redirect: "manual" });
    assert.equal(revokedApp.status, 302);
    assert.equal(revokedApp.headers.get("location"), "/signin?next=%2Fapp");

    // An expired session is refused the same way.
    const expired = await signInLocally(baseUrl);
    await executeD1(persistPath, "UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE revoked_at IS NULL");
    assert.equal((await fetch(`${baseUrl}/api/session`, { headers: { cookie: expired.cookie } })).status, 401);
    const expiredApp = await fetch(`${baseUrl}/app`, { headers: { cookie: expired.cookie }, redirect: "manual" });
    assert.equal(expiredApp.status, 302);
  } finally {
    if (runtime) await stop(runtime.child);
    await rm(persistPath, { recursive: true, force: true });
  }
});

test("local sample data never reaches a custom local workspace", { timeout: 120000 }, async () => {
  const persistPath = await mkdtemp(path.join(os.tmpdir(), "slate-custom-local-"));
  let runtime;

  try {
    await applyMigrations(persistPath);
    await executeD1(persistPath, "INSERT INTO workspaces (id, name, mark, created_at, updated_at, revision_id) VALUES ('custom-workspace', 'Custom local workspace', 'C', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z', 'custom-workspace-revision')");
    runtime = await startViteRuntime(persistPath);

    const signIn = await fetch(`${runtime.baseUrl}/api/auth/local-sign-in`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ next: "/app" }),
    });
    assert.equal(signIn.status, 409);
    assert.equal((await signIn.json()).code, "LOCAL_SAMPLE_UNAVAILABLE");

    const [workspaces] = await executeD1(persistPath, "SELECT id FROM workspaces ORDER BY id");
    assert.deepEqual(workspaces.results, [{ id: "custom-workspace" }]);
    assert.equal(await countRows(persistPath, "members"), 0);

    // The sample workspace on its own is upgraded rather than refused.
    await executeD1(persistPath, `DELETE FROM workspaces; INSERT INTO workspaces (id, name, mark, created_at, updated_at, revision_id) VALUES ('${sampleWorkspaceId}', 'Aurora Android Launch', 'A', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z', 'sample-revision'); INSERT INTO members (id, workspace_id, email, display_name, initials, role, is_setup_owner, created_at, updated_at) VALUES ('${sampleOwnerMemberId}', '${sampleWorkspaceId}', 'jamie@aurora.example', 'Jamie Park', 'JP', 'owner', 1, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')`);
    const upgraded = await fetch(`${runtime.baseUrl}/api/auth/local-sign-in`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ next: "/app" }),
    });
    assert.equal(upgraded.status, 200);
  } finally {
    if (runtime) await stop(runtime.child);
    await rm(persistPath, { recursive: true, force: true });
  }
});
