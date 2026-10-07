import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * The Workers Vitest pool runs the real Worker from a Wrangler config, but it
 * cannot serve the `[assets]` binding and it has no deployment variables. The
 * recipe's answer is a generated, gitignored, Vitest-only Wrangler config
 * derived from the ordinary local one: nothing here touches the deployed
 * template or the generated production `wrangler.toml`.
 *
 * `.vitest/` sits one level below the repository root, exactly like `deploy/`,
 * so the relative `main` and `migrations_dir` paths carry over unchanged.
 *
 * When TanStack Start lands, its resolved Vite `define` literals are written
 * into the `[vars]` block below (see "Configure Cloudflare Vitest from resolved
 * Start settings" in the migration recipe). That is the only change this file
 * needs for the Start conversion.
 */

const GENERATED_DIR = ".vitest";
const GENERATED_FILE = "wrangler.vitest.toml";
const SOURCE = "deploy/wrangler.local.toml";

/** Deployment variables the Worker requires before it will answer any request. */
const testVars: Record<string, string> = {
  APP_URL: "http://localhost:8787",
  SETUP_OWNER_EMAIL: "owner@slate.test",
  SESSION_SECRET: "slate-workers-test-session-secret",
  MAIL_FROM: "slate@slate.test",
  MAIL_API_KEY: "slate-workers-test-mail-key",
};

/** Drop whole top-level TOML tables (`[name]` / `[[name]]`) from a document. */
function withoutTables(toml: string, names: readonly string[]): string {
  const lines = toml.split("\n");
  const kept: string[] = [];
  let dropping = false;
  for (const line of lines) {
    const header = /^\s*\[\[?([^\]]+)\]\]?\s*$/.exec(line);
    if (header) dropping = names.includes(header[1].trim());
    if (!dropping) kept.push(line);
  }
  return kept.join("\n");
}

function renderVars(vars: Record<string, string>): string {
  const body = Object.entries(vars)
    .map(([name, value]) => `${name} = ${JSON.stringify(value)}`)
    .join("\n");
  return `\n[vars]\n${body}\n`;
}

/**
 * Writes the Vitest-only Wrangler config and returns its path relative to the
 * repository root, for `poolOptions.workers.wrangler.configPath`.
 */
export function resolveVitestWranglerConfigPath(root: string, profile?: "core-wiki" | "flagship"): string {
  const filename = profile ? `wrangler.${profile}.vitest.toml` : GENERATED_FILE;
  const source = readFileSync(path.join(root, SOURCE), "utf8");
  const generated = `${withoutTables(source, ["assets"]).trimEnd()}\n${renderVars({...testVars, ...(profile ? {SLATE_PROFILE: profile} : {})})}`;
  mkdirSync(path.join(root, GENERATED_DIR), { recursive: true });
  writeFileSync(path.join(root, GENERATED_DIR, filename), generated);
  return `./${GENERATED_DIR}/${filename}`;
}
