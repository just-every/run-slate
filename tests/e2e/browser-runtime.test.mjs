import {signInBrowser} from './outbox-auth.mjs';
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { chromium } from "@playwright/test";
import {
  applyMigrations,
  seedAuroraFixture,
  localDevelopmentVars,
  signInLocally,
  startEmittedWorker,
  startViteRuntime,
  stop,
} from "./runtime-harness.mjs";

/**
 * Browser proof for the rendering migration: real Vite/Start scripts load, React
 * hydrates, client navigation stays in one document, and nothing fails.
 *
 * This file is not part of `rer verify`: it needs Playwright browser binaries
 * (`pnpm exec playwright install chromium`), which a clean clone does not have.
 * Run it with `pnpm test:browser`.
 */

function watch(page) {
  const failures = { requests: [], consoleErrors: [], pageErrors: [] };
  page.on("requestfailed", (request) => failures.requests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));
  page.on("response", (response) => {
    if (response.status() >= 400) failures.requests.push(`${response.status()} ${response.url()}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") failures.consoleErrors.push(message.text());
  });
  page.on("pageerror", (cause) => failures.pageErrors.push(String(cause)));
  return failures;
}

function assertClean(failures, label) {
  assert.deepEqual(failures, { requests: [], consoleErrors: [], pageErrors: [] }, label);
}

test("the development server hydrates and navigates client-side", { timeout: 240000 }, async () => {
  const persistPath = await mkdtemp(path.join(os.tmpdir(), "slate-browser-dev-"));
  let runtime;
  let browser;

  try {
    await applyMigrations(persistPath);
    await seedAuroraFixture(persistPath);
    runtime = await startViteRuntime(persistPath);

    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await signInBrowser(page,runtime.baseUrl);
    const failures = watch(page);

    await page.goto(runtime.baseUrl, { waitUntil: "networkidle" });
    assert.equal(await page.textContent("h1"), "Slate");
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    assert.equal(await page.evaluate(() => Boolean(document.querySelector("script[type=module]"))), true);

    // A React link between Start documents navigates without a new document.
    await page.click("a[href='/signin']");
    await page.getByRole("heading", { name: "Sign in", exact: true }).waitFor();
    await page.getByLabel("Email address", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin);

    await page.getByLabel("Email address", {exact:true}).waitFor();

    await page.goto(`${runtime.baseUrl}/app`, { waitUntil: "networkidle" });
    assert.equal(await page.textContent("[data-testid='member-email']"), "jamie@aurora.example");
    await page.waitForSelector("[data-testid='workspace-empty-state']");

    assertClean(failures, "The development session reported failures.");
  } finally {
    if (browser) await browser.close();
    if (runtime) await stop(runtime.child);
    await rm(persistPath, { recursive: true, force: true });
  }
});

test("the emitted production Worker hydrates and exercises the server-function transport", { timeout: 240000 }, async () => {
  const persistPath = await mkdtemp(path.join(os.tmpdir(), "slate-browser-artifact-"));
  let runtime;
  let browser;

  try {
    await applyMigrations(persistPath);
    await seedAuroraFixture(persistPath);
    runtime = await startEmittedWorker(persistPath, localDevelopmentVars);

    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await signInBrowser(page,runtime.baseUrl);
    const failures = watch(page);
    const serverFunctionCalls = [];
    page.on("request", (request) => {
      if (request.url().includes("/_serverFn/")) serverFunctionCalls.push(request.url());
    });

    await page.goto(runtime.baseUrl, { waitUntil: "networkidle" });
    assert.equal(await page.textContent("h1"), "Slate");

    // A React link between two public Start documents stays in one document.
    const publicTimeOrigin = await page.evaluate(() => performance.timeOrigin);
    await page.click("a[href='/signin']");
    await page.getByRole("heading", { name: "Sign in", exact: true }).waitFor();
    await page.getByLabel("Email address", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => performance.timeOrigin), publicTimeOrigin);

    // The authenticated operator document renders private data server-side, and
    // a client navigation back into it drives the generated transport rather
    // than a new document request.
    await page.goto(`${runtime.baseUrl}/app`, { waitUntil: "networkidle" });
    assert.equal(await page.textContent("[data-testid='member-email']"), "jamie@aurora.example");
    const operatorTimeOrigin = await page.evaluate(() => performance.timeOrigin);
    serverFunctionCalls.length = 0;

    await page.click("header a[href='/']");
    await page.waitForSelector("h1:has-text('Slate')");
    assert.equal(await page.evaluate(() => performance.timeOrigin), operatorTimeOrigin);

    await page.goBack();
    await page.waitForSelector("[data-testid='workspace-empty-state']");
    assert.equal(await page.textContent("[data-testid='member-email']"), "jamie@aurora.example");
    assert.equal(await page.evaluate(() => performance.timeOrigin), operatorTimeOrigin);
    assert.ok(serverFunctionCalls.length > 0, "Client navigation into /app did not call the generated server function.");

    assertClean(failures, "The production-artifact session reported failures.");
  } finally {
    if (browser) await browser.close();
    if (runtime) await stop(runtime.child);
    await rm(persistPath, { recursive: true, force: true });
  }
});
