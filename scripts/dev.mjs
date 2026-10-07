import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const configPath = process.env.SLATE_WRANGLER_CONFIG_PATH ?? (existsSync("wrangler.toml") ? "wrangler.toml" : "deploy/wrangler.local.toml");
const persistPath = process.env.SLATE_PERSIST_STATE_PATH ?? ".wrangler/state";

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("exit", (code, signal) => resolve({ code: code ?? 1, signal }));
    child.on("error", () => resolve({ code: 1, signal: null }));
  });
}

const migration = await run("pnpm", [
  "exec",
  "wrangler",
  "d1",
  "migrations",
  "apply",
  "DB",
  "--local",
  "--persist-to",
  persistPath,
  "--config",
  configPath,
]);

if (migration.code !== 0) process.exit(migration.code);

const forwardedArgs = process.argv.slice(2);
if (forwardedArgs[0] === "--") forwardedArgs.shift();

const vite = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", ...forwardedArgs], {
  stdio: "inherit",
  env: {
    ...process.env,
    SLATE_LOCAL_SAMPLE_DATA: "true",
    SLATE_PERSIST_STATE_PATH: persistPath,
    SLATE_WRANGLER_CONFIG_PATH: configPath,
  },
});
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    vite.kill(signal);
  });
}

vite.on("exit", (code, signal) => {
  if (signal) process.exitCode = 1;
  else process.exitCode = code ?? 1;
});
