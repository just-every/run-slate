import { testDevKey, sourceDevOrigins } from "./dev-key.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { seedAurora } from "../fixtures/aurora/seed.mjs";
import { signInWithOutbox } from "./outbox-auth.mjs";
import { emittedRuntimeConfig } from './emitted-runtime-config.mjs';
import process from "node:process";
import { fileURLToPath } from "node:url";
import { launch, safeEnvironment, stop as stopProcess } from "../qualification/local/process.mjs";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const localWranglerConfig = "wrangler.jsonc";
const runtimes = new Map();
const runtimeSettings = new Map();
const runtimeOrigins = new Map();

/** Own the whole CLI process group, including pnpm, workerd and esbuild. */
export function launchRuntime(command, args, options = {}) {
  const runtime = launch(command, args, { cwd: root, env: safeEnvironment(), ...options });
  runtimes.set(runtime.child, runtime);
  return runtime.child;
}

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env: safeEnvironment(), ...options });
    let output = "";
    let errorOutput = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { errorOutput += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) return resolve({ output, errorOutput });
      reject(new Error(`${command} ${args.join(" ")} exited ${code}\n${output}\n${errorOutput}`));
    });
  });
}

export async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  await new Promise((resolve, reject) => server.close((cause) => cause ? reject(cause) : resolve()));
  return address.port;
}

export async function waitForReady(baseUrl, child, timeoutMs = 60000, headers) {
  const deadline = Date.now() + timeoutMs;
  let failure;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Runtime exited with ${child.exitCode ?? child.signalCode} before it became ready.`);
    try {
      const response = await fetch(`${baseUrl}/health`, { headers });
      if (response.status === 200 || response.status === 503) return;
    } catch (cause) {
      failure = cause;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Runtime did not become ready at ${baseUrl}: ${String(failure)}`);
}

export async function executeD1(persistPath, command) {
  const { output } = await run("pnpm", [
    "exec", "wrangler", "d1", "execute", "DB", "--local",
    "--persist-to", persistPath, "--config", localWranglerConfig,
    "--command", command, "--json",
  ]);
  return JSON.parse(output);
}

export async function applyMigrations(persistPath) {
  await run("pnpm", [
    "exec", "wrangler", "d1", "migrations", "apply", "DB", "--local",
    "--persist-to", persistPath, "--config", localWranglerConfig,
  ]);
}

export async function countRows(persistPath, table) {
  const [result] = await executeD1(persistPath, `SELECT COUNT(*) AS count FROM ${table}`);
  return result.results[0].count;
}

/** A real per-run secret. A session digest is keyed by SESSION_SECRET in every mode. */
export const testSessionSecret = randomUUID();

/** The vars a locally bound emitted Worker needs to behave like `rer dev`. */
export const localDevelopmentVars = { RER_DEV_KEY: testDevKey, LOCAL_DEVELOPMENT: "true", SESSION_SECRET: testSessionSecret, SETUP_OWNER_EMAIL: "jamie@aurora.example", MAIL_PROVIDER: "development", MAIL_FROM: "slate@test.invalid", AI_ENABLED: "false", SSO_ENABLED: "false", LINK_PREVIEWS_ENABLED: "false" };
export const seedAuroraFixture = persistPath => seedAurora(sql => executeD1(persistPath, sql));

/** `vite dev` on Miniflare with the local D1/R2/Queue bindings. */
export async function startViteRuntime(persistPath) {
  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const settingsRoot = path.join(root, ".artifacts/local-runtimes");
  await mkdir(settingsRoot, { recursive: true, mode: 0o700 });
  const settingsDirectory = await mkdtemp(path.join(settingsRoot, "runtime-"));
  const settingsPath = path.join(settingsDirectory, ".dev.vars");
  await writeFile(settingsPath, Object.entries({...localDevelopmentVars, APP_URL: baseUrl}).map(([key,value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n", {mode: 0o600});
  const child = launchRuntime("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: root,
    env: {
      ...safeEnvironment(),
      ...(process.env.SLATE_PROFILE ? {SLATE_PROFILE:process.env.SLATE_PROFILE} : {}),
      SLATE_LOCAL_SETTINGS_PATH: settingsPath,
      SLATE_PERSIST_STATE_PATH: persistPath,
      SLATE_WRANGLER_CONFIG_PATH: localWranglerConfig,
    },
  });
  runtimeSettings.set(child, settingsDirectory);
  sourceDevOrigins.add(baseUrl);
  runtimeOrigins.set(child,baseUrl);
  try { await waitForReady(baseUrl, child); } catch (error) { await stop(child); throw error; }
  return { baseUrl, child };
}

/** The adopted Base production module/converter path over the emitted artifact. */
export async function startEmittedWorker(persistPath, vars = {}, allocatedPort, triggerMode) {
  const port = allocatedPort ?? await availablePort();
  const config = await emittedRuntimeConfig(root, persistPath);
  const baseUrl = `http://127.0.0.1:${port}`;
  const varsPath = path.join(persistPath, 'runtime-config', 'vars.json');
  await writeFile(varsPath, JSON.stringify({ ...vars, ...(vars.LOCAL_DEVELOPMENT === "true" ? { APP_URL: baseUrl } : {}) }), { mode: 0o600 });
  const child = launchRuntime("node", ["tests/e2e/emitted-runtime.mjs", config, persistPath, String(port), varsPath, ...(triggerMode ? [triggerMode] : [])], { cwd: root, ...(triggerMode === "scheduled" ? { stdio: ["ignore", "pipe", "pipe", "ipc"] } : {}) });
  try { await waitForReady(baseUrl, child); } catch (error) { await stop(child); throw error; }
  return { baseUrl, child };
}

/**
 * A request with an explicit Host header. `fetch` refuses to set one — `host` is
 * a forbidden header name — and the loopback check reads the request host, so
 * the non-loopback cases go through `node:http` instead.
 */
export function requestWithHost(baseUrl, requestPath, host, headers = {}) {
  const target = new URL(requestPath, baseUrl);
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: "GET",
      headers: { ...headers, host },
    }, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    request.on("error", reject);
    request.end();
  });
}

export async function stop(child) {
  const runtime = runtimes.get(child);
  if (!runtime) return;
  await stopProcess(runtime);
  runtimes.delete(child);
  sourceDevOrigins.delete(runtimeOrigins.get(child));
  runtimeOrigins.delete(child);
  const settingsDirectory = runtimeSettings.get(child);
  if (settingsDirectory) { await rm(settingsDirectory, { recursive: true, force: true }); runtimeSettings.delete(child); }
}

export function sessionCookie(response) {
  const header = response.headers.get("set-cookie");
  assert(header, "The response carried no Set-Cookie header.");
  return header.split(";", 1)[0];
}

export async function signInLocally(baseUrl, next = "/app", email = "jamie@aurora.example") {
  const session = await signInWithOutbox(baseUrl, email);
  assert.equal(session.body.next, next);
  return session;
}
