import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { launch, stop as stopProcess } from "../qualification/local/process.mjs";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const localWranglerConfig = "deploy/wrangler.local.toml";
const runtimes = new Map();

/** Own the whole CLI process group, including pnpm, workerd and esbuild. */
export function launchRuntime(command, args, options = {}) {
  const runtime = launch(command, args, { cwd: root, env: process.env, ...options });
  runtimes.set(runtime.child, runtime);
  return runtime.child;
}

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, ...options });
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

export async function waitForReady(baseUrl, child, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let failure;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Runtime exited with ${child.exitCode ?? child.signalCode} before it became ready.`);
    try {
      const response = await fetch(`${baseUrl}/health`);
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

/** The vars a locally bound emitted Worker needs to behave like `pnpm dev`. */
export const localSampleVars = { LOCAL_SAMPLE_DATA: "true", SESSION_SECRET: testSessionSecret };

/** `vite dev` on Miniflare with the local D1/R2/Queue bindings. */
export async function startViteRuntime(persistPath) {
  const port = await availablePort();
  const child = launchRuntime("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: root,
    env: {
      ...process.env,
      SLATE_LOCAL_SAMPLE_DATA: "true",
      SLATE_SESSION_SECRET: testSessionSecret,
      SLATE_PERSIST_STATE_PATH: persistPath,
      SLATE_WRANGLER_CONFIG_PATH: localWranglerConfig,
    },
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  try { await waitForReady(baseUrl, child); } catch (error) { await stop(child); throw error; }
  return { baseUrl, child };
}

/** `wrangler dev` over the emitted production artifact, in local workerd. */
export async function startEmittedWorker(persistPath, vars = {}) {
  const port = await availablePort();
  const varArgs = Object.entries(vars).flatMap(([name, value]) => ["--var", `${name}:${value}`]);
  const child = launchRuntime("pnpm", [
    "exec", "wrangler", "dev",
    "--config", "dist/server/wrangler.json",
    "--local", "--ip", "127.0.0.1", "--port", String(port),
    "--persist-to", persistPath,
    ...varArgs,
  ], { cwd: root });
  const baseUrl = `http://127.0.0.1:${port}`;
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
}

export function sessionCookie(response) {
  const header = response.headers.get("set-cookie");
  assert(header, "The response carried no Set-Cookie header.");
  return header.split(";", 1)[0];
}

export async function signInLocally(baseUrl, next = "/app") {
  const response = await fetch(`${baseUrl}/api/auth/local-sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ next }),
  });
  const payload = await response.text();
  assert.equal(response.status, 200, `Local sign-in failed: ${payload}`);
  return { cookie: sessionCookie(response), body: JSON.parse(payload) };
}
