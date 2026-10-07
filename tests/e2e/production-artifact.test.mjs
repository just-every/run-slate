import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyMigrations,
  executeD1,
  localSampleVars,
  requestWithHost,
  root,
  signInLocally,
  startEmittedWorker,
  stop,
} from "./runtime-harness.mjs";

const clientAssets = path.join(root, "dist", "client", "assets");
const serverEntry = path.join(root, "dist", "server", "index.js");
const sampleOwnerMemberId = "01JBF2JH4M0D3S8ZJ1TQW7K0B1";

async function requireBuild() {
  try {
    await stat(serverEntry);
  } catch {
    throw new Error("dist/server/index.js is missing. Run `pnpm build` before the production-artifact tests.");
  }
}

async function clientBundleText() {
  const files = await readdir(clientAssets);
  const scripts = files.filter((file) => file.endsWith(".js"));
  assert.ok(scripts.length > 0, "The build emitted no client JavaScript.");
  const contents = await Promise.all(scripts.map((file) => readFile(path.join(clientAssets, file), "utf8")));
  return contents.join("\n");
}

/** The generated server-function id is derived from the emitted artifact, never copied. */
async function generatedServerFunctionId() {
  const bundle = await clientBundleText();
  const ids = [...new Set([...bundle.matchAll(/\/_serverFn\/`\+|[0-9a-f]{64}/g)].map((match) => match[0]))]
    .filter((value) => /^[0-9a-f]{64}$/.test(value));
  assert.equal(ids.length, 1, `Expected exactly one generated server-function id in the client bundle, found ${ids.length}.`);
  return ids[0];
}

test("the build emits a clean client bundle and no prerendered HTML", async () => {
  await requireBuild();

  const bundle = await clientBundleText();
  for (const serverOnly of ["cloudflare:workers", "drizzle-orm", "sqliteTable", "token_digest", "tokenDigest", "SESSION_SECRET", "MAIL_API_KEY"]) {
    assert.doesNotMatch(bundle, new RegExp(serverOnly.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `The client bundle contains the server-only symbol ${serverOnly}.`);
  }

  // Prerendering is configured and disabled, so the build emits no HTML at all.
  const emitted = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".html")) emitted.push(path.relative(root, full));
    }
  }
  await walk(path.join(root, "dist", "client"));
  assert.deepEqual(emitted, []);
});

test("every request family refuses a deployment that is missing configuration", { timeout: 180000 }, async () => {
  await requireBuild();
  const persistPath = await mkdtemp(path.join(os.tmpdir(), "slate-artifact-bare-"));
  let runtime;

  try {
    await applyMigrations(persistPath);
    runtime = await startEmittedWorker(persistPath);
    const { baseUrl } = runtime;
    const serverFunctionId = await generatedServerFunctionId();

    // Every family answers the same way, not just /health: a misconfigured
    // deployment must not render a document or serialise a server-function
    // result behind a failing health check.
    const gated = [
      ["/health", {}],
      ["/", {}],
      ["/", { headers: { "sec-fetch-mode": "navigate" } }],
      ["/signin", {}],
      ["/app", {}],
      ["/nothing-here", {}],
      [`/_serverFn/${serverFunctionId}`, { headers: { origin: baseUrl, "x-tsr-serverFn": "true" } }],
    ];
    for (const [gatedPath, init] of gated) {
      const response = await fetch(`${baseUrl}${gatedPath}`, { redirect: "manual", ...init });
      assert.equal(response.status, 503, `${gatedPath} did not return 503 on an unconfigured deployment.`);
      const body = await response.json();
      assert.equal(body.code, "CONFIGURATION_INVALID", gatedPath);
      for (const name of ["APP_URL", "SETUP_OWNER_EMAIL", "SESSION_SECRET", "MAIL_FROM", "MAIL_API_KEY"]) {
        assert.match(body.message, new RegExp(name), gatedPath);
      }
    }

    // A session cookie does not buy past the configuration gate either.
    const withCookie = await fetch(`${baseUrl}/app`, { headers: { cookie: "slate_session=anything" }, redirect: "manual" });
    assert.equal(withCookie.status, 503);
  } finally {
    if (runtime) await stop(runtime.child);
    await rm(persistPath, { recursive: true, force: true });
  }
});

test("the emitted Worker serves every declared surface and a real 404 everywhere else", { timeout: 240000 }, async () => {
  await requireBuild();
  const persistPath = await mkdtemp(path.join(os.tmpdir(), "slate-artifact-"));
  let runtime;

  try {
    await applyMigrations(persistPath);
    runtime = await startEmittedWorker(persistPath, localSampleVars);
    const { baseUrl } = runtime;
    const serverFunctionId = await generatedServerFunctionId();

    assert.equal((await fetch(`${baseUrl}/health`)).status, 200);

    // The local sample binding is loopback-only. The same Worker asked for a
    // non-loopback host is an unconfigured deployment, and every family must
    // say so rather than rendering the sample workspace to the open internet.
    for (const gatedPath of ["/health", "/", "/signin", "/app", "/api/auth/capabilities"]) {
      const response = await requestWithHost(baseUrl, gatedPath, "slate.example");
      assert.equal(response.status, 503, `${gatedPath} on a non-loopback host did not return 503.`);
      assert.equal(JSON.parse(response.body).code, "CONFIGURATION_INVALID", gatedPath);
      assert.doesNotMatch(response.body, /Jamie Park|jamie@aurora\.example/, gatedPath);
    }

    const landingHtml = await (await fetch(baseUrl)).text();
    assert.match(landingHtml, /Sign in to workspace/);
    assert.doesNotMatch(landingHtml, /Jamie Park|jamie@aurora\.example/);
    assert.match(landingHtml, /<script type="module"/);

    // Assets are served from the emitted output with their real type.
    const assetName = (await readdir(clientAssets)).find((file) => file.endsWith(".js"));
    const asset = await fetch(`${baseUrl}/assets/${assetName}`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type") ?? "", /javascript/);

    // Unknown documents, missing assets, and development-only virtual paths are
    // real 404s in the emitted artifact, with and without a navigation request.
    const notFoundPaths = [
      "/nothing-here",
      "/assets/missing-asset-that-was-never-built.js",
      "/@id/virtual:tanstack-start-dev-client-entry",
      "/src/core/app/styles.css",
      "/@vite/client",
    ];
    for (const unknownPath of notFoundPaths) {
      for (const headers of [{}, { "sec-fetch-mode": "navigate" }]) {
        const response = await fetch(`${baseUrl}${unknownPath}`, { headers });
        assert.equal(response.status, 404, `${unknownPath} ${JSON.stringify(headers)}`);
      }
    }

    const { cookie } = await signInLocally(baseUrl);

    // BASE-ACCESS-002, protected operator document.
    const anonymousApp = await fetch(`${baseUrl}/app`, { redirect: "manual" });
    assert.equal(anonymousApp.status, 302);
    assert.equal(anonymousApp.headers.get("location"), "/signin?next=%2Fapp");
    const authenticatedApp = await fetch(`${baseUrl}/app`, { headers: { cookie } });
    assert.equal(authenticatedApp.status, 200);
    const appHtml = await authenticatedApp.text();
    assert.match(appHtml, /data-testid="member-name">Jamie Park</);

    // Request-time SSR against the bound D1, proven by changing the binding.
    await executeD1(persistPath, `UPDATE members SET display_name = 'Changed In D1' WHERE id = '${sampleOwnerMemberId}'`);
    const changedHtml = await (await fetch(`${baseUrl}/app`, { headers: { cookie } })).text();
    assert.match(changedHtml, /data-testid="member-name">Changed In D1</);
    await executeD1(persistPath, `UPDATE members SET display_name = 'Jamie Park' WHERE id = '${sampleOwnerMemberId}'`);

    // BASE-ACCESS-002, protected operator HTTP API.
    assert.equal((await fetch(`${baseUrl}/api/session`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/unknown-member`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/unknown-member`, { headers: { cookie } })).status, 404);
    assert.equal((await fetch(`${baseUrl}/api/session`, { headers: { cookie } })).status, 200);

    // BASE-ACCESS-002, private generated server function, over the pinned wire protocol.
    const serverFunction = `${baseUrl}/_serverFn/${serverFunctionId}`;
    const serverFunctionHeaders = {
      origin: baseUrl,
      "x-tsr-serverFn": "true",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
    };

    const ipv6Host = `[::1]:${new URL(baseUrl).port}`;
    const ipv6Call = await requestWithHost(baseUrl, `/_serverFn/${serverFunctionId}`, ipv6Host, {
      ...serverFunctionHeaders, origin: `http://${ipv6Host}`, cookie,
    });
    assert.equal(ipv6Call.status, 200, ipv6Call.body);
    assert.match(ipv6Call.body, /jamie@aurora\.example/);

    // The pinned Start resolver owns unknown generated IDs and reports 500.
    // Preserve that framework behavior without inventing a second registry.
    const unknownFunction = await fetch(`${baseUrl}/_serverFn/${"0".repeat(64)}`, { headers: { ...serverFunctionHeaders, cookie } });
    assert.equal(unknownFunction.status, 500);
    assert.doesNotMatch(await unknownFunction.text(), /Jamie Park|jamie@aurora\.example|Aurora Android Launch/);

    const cases = [];
    for (const state of ["valid", "missing", "expired", "revoked"]) {
      if (state === "expired") await executeD1(persistPath, "UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z'");
      if (state === "revoked") await executeD1(persistPath, "UPDATE sessions SET expires_at = '2099-01-01T00:00:00.000Z', revoked_at = '2026-01-01T00:00:00.000Z'");
      const headers = state === "missing" ? {} : { cookie };
      const document = await fetch(`${baseUrl}/app?view=recent`, { headers, redirect: "manual" });
      const documentBody = await document.text();
      assert.equal(document.status, state === "valid" ? 200 : 302, state);
      if (state === "valid") assert.match(documentBody, /Jamie Park/);
      else {
        assert.equal(document.headers.get("location"), "/signin?next=%2Fapp%3Fview%3Drecent", state);
        assert.equal(documentBody, "", state);
      }
      for (const apiPath of ["/api/session", "/api/unknown-member"]) {
        const response = await fetch(`${baseUrl}${apiPath}`, { headers });
        assert.equal(response.status, state === "valid" ? (apiPath === "/api/session" ? 200 : 404) : 401, `${state} ${apiPath}`);
        if (state !== "valid") assert.doesNotMatch(await response.text(), /Jamie Park|jamie@aurora\.example|Aurora Android Launch/);
      }
      const call = await fetch(serverFunction, { headers: { ...serverFunctionHeaders, ...headers }, redirect: "manual" });
      const payload = await call.text();
      assert.equal(call.status, 200, `${state}: ${payload}`);
      if (state === "valid") {
        assert.equal(call.headers.get("x-tss-serialized"), "true");
        assert.match(payload, /jamie@aurora\.example/);
        assert.match(payload, /Aurora Android Launch/);
      } else {
        const denial = JSON.parse(payload);
        assert.equal(denial.isSerializedRedirect, true, payload);
        assert.equal(denial.to, "/signin", payload);
        assert.deepEqual(denial.search, { next: "/app" });
        assert.doesNotMatch(payload, /Jamie Park|jamie@aurora\.example|Aurora Android Launch/);
      }
      cases.push({ name: state, status: "passed" });
    }
    if (process.env.SLATE_ACCESS_REPORT_PATH) await writeFile(process.env.SLATE_ACCESS_REPORT_PATH, JSON.stringify({ clause: "BASE-ACCESS-002", status: "satisfied", cases }));

    // Origin is a separate guard from the session: a cross-origin mutation is refused.
    const hostileOrigin = await fetch(serverFunction, {
      method: "POST",
      headers: { ...serverFunctionHeaders, origin: "https://attacker.example", "sec-fetch-site": "cross-site", cookie },
    });
    assert.equal(hostileOrigin.status, 403);
    assert.doesNotMatch(await hostileOrigin.text(), /jamie@aurora\.example/);
  } finally {
    if (runtime) await stop(runtime.child);
    await rm(persistPath, { recursive: true, force: true });
  }
});
