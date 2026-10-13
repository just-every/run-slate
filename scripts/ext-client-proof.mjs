/**
 * Proves the buyer client-extension mount, per step 10 of the migration recipe.
 *
 * The whole checkout is copied to a temporary directory first (node_modules is
 * symlinked, not copied) and every write, build and run happens there, so the
 * live tree is never mutated and a kill leaves nothing behind. The copy gets a
 * nonempty `src/ext/index.client.tsx`, and the proof checks that the
 * contribution is absent from the authenticated SSR response and from the
 * emitted server JavaScript, that the initial client tree matches the SSR HTML
 * before the mount loads, and that it renders and responds to a click after
 * hydration.
 *
 * Run it with `node scripts/ext-client-proof.mjs`. It is not part of
 * `rer verify`: it needs Playwright browser binaries.
 */
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const liveRoot = process.cwd();
const marker = "SLATE-EXT-CLIENT-MARKER";
const slot = "workspace.navigation.after.v1";

const fixture = `import { useState } from "react";
import type { ClientSlots } from "../core/app/ext-client";

function Contribution() {
  const [pressed, setPressed] = useState(false);
  return (
    <button data-testid="ext-marker" onClick={() => setPressed(true)} type="button">
      {pressed ? "${marker}-PRESSED" : "${marker}"}
    </button>
  );
}

export const slateClientSlots: ClientSlots = {
  "${slot}": () => <Contribution />,
};
`;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options });
    let output = "";
    child.stdout?.on("data", (chunk) => { output += chunk; });
    child.stderr?.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve(output) : reject(new Error(`${command} ${args.join(" ")} exited ${code}\n${output}`)));
  });
}

const checkout = await mkdtemp(path.join(os.tmpdir(), "slate-ext-proof-checkout-"));
const results = {};
let runtime;
let browser;
let persistPath;
let harness;

try {
  // rsync the checkout without node_modules, dist or local state, then symlink
  // the installed dependencies so the copy builds without a fresh install.
  await run("rsync", [
    "-a",
    "--exclude", "node_modules",
    "--exclude", "dist",
    "--exclude", ".wrangler",
    "--exclude", ".tanstack",
    "--exclude", ".git",
    `${liveRoot}/`,
    `${checkout}/`,
  ]);
  await symlink(path.join(liveRoot, "node_modules"), path.join(checkout, "node_modules"), "dir");

  await writeFile(path.join(checkout, "src", "ext", "index.client.tsx"), fixture, "utf8");
  // Instrument only the disposable fixture: layout effects observe React's
  // first commit before the provider's passive effect starts the client import.
  const providerPath = path.join(checkout, "src/core/app/ext-client.tsx");
  const provider = await readFile(providerPath, "utf8");
  assert.ok(provider.includes("  useEffect(() => {"), "Provider effect seam changed.");
  await writeFile(providerPath, provider
    .replace("useContext, useEffect,", "useContext, useEffect, useLayoutEffect,")
    .replace("  useEffect(() => {", `  useLayoutEffect(() => {
    const proof = (window as any).__extensionProof;
    if (!proof || proof.commit) return;
    const rail = document.querySelector("aside");
    proof.commit = {
      html: rail?.outerHTML,
      sameNodes: proof.nodes.every((node: Node, index: number) => {
        const current = [rail, ...Array.from(rail!.querySelectorAll("*"))];
        return current[index] === node;
      }),
      nodeCount: rail ? 1 + rail.querySelectorAll("*").length : 0,
      extensionAbsent: !document.querySelector('[data-testid="ext-marker"]'),
    };
  }, []);
  useEffect(() => {`));
  await run("pnpm", ["exec", "vite", "build"], { cwd: checkout });

  harness = await import(`${checkout}/tests/e2e/runtime-harness.mjs`);
  const { applyMigrations, localSampleVars, signInLocally, startEmittedWorker, stop } = harness;

  const serverAssets = path.join(checkout, "dist", "server", "assets");
  const serverBundle = [
    await readFile(path.join(checkout, "dist", "server", "index.js"), "utf8"),
    ...(await Promise.all((await readdir(serverAssets))
      .filter((file) => file.endsWith(".js"))
      .map((file) => readFile(path.join(serverAssets, file), "utf8")))),
  ].join("\n");
  assert.ok(!serverBundle.includes(marker), "The emitted server JavaScript contains the extension marker.");
  assert.ok(!serverBundle.includes("ext/index.client"), "The emitted server JavaScript imports the buyer client mount.");
  results.serverBundleFreeOfExtension = true;
  const clientAssets = path.join(checkout, "dist/client/assets");
  const clientBundle = (await Promise.all((await readdir(clientAssets))
    .filter((file) => file.endsWith(".js"))
    .map((file) => readFile(path.join(clientAssets, file), "utf8")))).join("\n");
  assert.ok(clientBundle.includes(marker), "The emitted browser JavaScript is missing the extension.");
  for (const forbidden of ["cloudflare:workers", "node:async_hooks", "AUTH_SESSION_SECRET", "BETTER_AUTH_SECRET"]) {
    assert.ok(!clientBundle.includes(forbidden), `Browser bundle contains server-only reference ${forbidden}.`);
  }
  results.browserBundleContainsExtensionWithoutServerReferences = true;


  persistPath = await mkdtemp(path.join(os.tmpdir(), "slate-ext-proof-state-"));
  await applyMigrations(persistPath);
  runtime = await startEmittedWorker(persistPath, localSampleVars);
  const { cookie } = await signInLocally(runtime.baseUrl);

  const ssr = await (await fetch(`${runtime.baseUrl}/app`, { headers: { cookie } })).text();
  assert.ok(ssr.includes("Jamie Park"), "The authenticated SSR response is missing the server identity.");
  assert.ok(!ssr.includes(marker), "The authenticated SSR response already contains the extension marker.");
  results.ssrCarriesIdentityWithoutExtension = true;

  browser = await chromium.launch();
  const context = await browser.newContext();
  const [name, value] = cookie.split("=");
  await context.addCookies([{ name, value, url: runtime.baseUrl }]);
  const page = await context.newPage();
  const failures = { requests: [], consoleErrors: [], pageErrors: [] };
  page.on("requestfailed", (request) => failures.requests.push(`${request.method()} ${request.url()}`));
  page.on("response", (response) => { if (response.status() >= 400) failures.requests.push(`${response.status()} ${response.url()}`); });
  page.on("console", (message) => { if (message.type() === "error") failures.consoleErrors.push(message.text()); });
  page.on("pageerror", (cause) => failures.pageErrors.push(String(cause)));

  // Use exactly the authenticated raw response above, then hold every script
  // until the browser has parsed the complete rail. The retained node objects
  // distinguish hydration from replacement by an equal-looking client tree.
  let releaseScripts;
  const scriptsReleased = new Promise((resolve) => { releaseScripts = resolve; });
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.isNavigationRequest() && request.url() === `${runtime.baseUrl}/app`) {
      await route.fulfill({ status: 200, contentType: "text/html", body: ssr });
    } else {
      if (request.resourceType() === "script") await scriptsReleased;
      await route.continue();
    }
  });
  await page.goto(`${runtime.baseUrl}/app`, { waitUntil: "commit" });
  await page.waitForFunction(() => document.readyState !== "loading");
  await page.waitForSelector("aside", { state: "attached" });
  const parsedSsrRail = await page.evaluate((raw) => {
    const expected = new DOMParser().parseFromString(raw, "text/html").querySelector("aside");
    const rail = document.querySelector("aside");
    window.__extensionProof = { nodes: [rail, ...rail.querySelectorAll("*")] };
    return { expected: expected.outerHTML, actual: rail.outerHTML };
  }, ssr);
  assert.equal(parsedSsrRail.actual, parsedSsrRail.expected, "Browser-parsed rail differs from raw SSR.");
  assert.ok(!parsedSsrRail.actual.includes(marker));
  releaseScripts();
  await page.waitForFunction(() => window.__extensionProof?.commit);
  const commit = await page.evaluate(() => window.__extensionProof.commit);
  assert.equal(commit.html, parsedSsrRail.expected, "Full rail changed during the first React commit.");
  assert.ok(commit.sameNodes, "Hydration replaced SSR rail nodes.");
  assert.ok(commit.extensionAbsent, "Extension was present at the first React commit.");
  results.initialClientTreeMatchesSsr = {
    fullRailHtmlEqual: true,
    ssrNodeIdentityPreserved: true,
    preservedElementCount: commit.nodeCount,
    extensionAbsentAtFirstLayoutEffect: true,
  };

  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  await page.waitForSelector("[data-testid='ext-marker']");
  assert.equal(await page.textContent("[data-testid='ext-marker']"), marker);
  await page.click("[data-testid='ext-marker']");
  assert.equal(await page.textContent("[data-testid='ext-marker']"), `${marker}-PRESSED`);
  results.extensionRendersAndInteractsAfterHydration = true;

  await page.click("header a[href='/']");
  await page.waitForURL(`${runtime.baseUrl}/`);
  await page.waitForSelector("a:has-text('Sign in to workspace')");
  assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin);
  results.internalLinkStaysInOneDocument = true;

  assert.deepEqual(failures, { requests: [], consoleErrors: [], pageErrors: [] }, `Browser reported failures: ${JSON.stringify(failures)}`);
  results.noFailedRequestsOrErrors = true;

  console.log(JSON.stringify({ proof: "ext-client-mount", marker, slot, checkout, results }, null, 2));
} finally {
  if (browser) await browser.close();
  if (runtime && harness) await harness.stop(runtime.child);
  if (persistPath) await rm(persistPath, { recursive: true, force: true });
  await rm(checkout, { recursive: true, force: true });
}
