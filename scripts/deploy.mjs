import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { deploymentCachePath } from "./deployment.mjs";

const { values } = parseArgs({ options: { help: { type: "boolean", short: "h" } } });
if (values.help) {
  console.log("Usage: pnpm run deploy [--help]\nConfigure SLATE_* environment variables as described in OPERATIONS.md and docs/release/sendgrid-deployment.md.\nWithout --help, runs setup, builds and deploys the Worker, then checks remote health.");
  process.exit(0);
}

const root = process.cwd();
const environment = process.env.SLATE_DEPLOY_ENV;
if (!environment) throw new Error("Missing required setup input: SLATE_DEPLOY_ENV.");

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

if (await run("node", ["scripts/setup.mjs"]) !== 0) process.exitCode = 1;
if (process.exitCode) process.exit(process.exitCode);
if (await run("pnpm", ["build"]) !== 0) process.exitCode = 1;
if (process.exitCode) process.exit(process.exitCode);
if (await run("pnpm", ["exec", "wrangler", "deploy", "--config", "dist/server/wrangler.json"]) !== 0) process.exitCode = 1;
if (process.exitCode) process.exit(process.exitCode);

const cache = JSON.parse(await readFile(deploymentCachePath(root, environment), "utf8"));
const response = await fetch(new URL("/health", cache.appUrl));
const body = await response.json().catch(() => null);
if (!response.ok || body?.status !== "ok") throw new Error(`Deployment health request failed with ${response.status}.`);

for (const dependency of ["database", "files"]) {
  if (body?.checks?.[dependency]?.status !== "reachable") {
    throw new Error(`Deployment health response did not verify ${dependency} reachability.`);
  }
}

console.log(JSON.stringify({ deployed: cache.worker, health: new URL("/health", cache.appUrl).toString(), checks: body.checks }, null, 2));
