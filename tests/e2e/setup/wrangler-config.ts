import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { experimental_readRawConfig } from "wrangler";

/**
 * The Workers Vitest pool runs the real Worker from a Wrangler config, but it
 * has no build output and no deployment variables. Generate an ignored JSON
 * config from the actual local config, resolving source paths before moving it
 * into `.vitest/`; the Worker's ASSETS binding serves the unbuilt `public/`
 * files. Production configuration stays untouched.
 */

const GENERATED_DIR = ".vitest";
const GENERATED_FILE = "wrangler.vitest.json";
const SOURCE = "wrangler.jsonc";

/** Deployment variables the Worker requires before it will answer any request. */
const testVars: Record<string, string> = {
  // Base operator-auth admits only an HTTPS deployment origin, as production uses.
  APP_URL: "https://slate.test",
  PUBLIC_PAGE_HOST: "localhost:8787",
  SETUP_OWNER_EMAIL: "owner@slate.test",
  SESSION_SECRET: "slate-workers-test-session-secret",
  MAIL_PROVIDER: 'resend', MAIL_FROM: "slate@slate.test",
  MAIL_API_KEY: "synthetic-slate-workers-test-mail-key",
};

/**
 * Writes the Vitest-only Wrangler config and returns its path relative to the
 * repository root, for `poolOptions.workers.wrangler.configPath`.
 */
export function resolveVitestWranglerConfigPath(root: string, profile?: "core-wiki" | "flagship"): string {
  const filename = profile ? `wrangler.${profile}.vitest.json` : GENERATED_FILE;
  const { rawConfig } = experimental_readRawConfig({ config: path.join(root, SOURCE) });
  const config = rawConfig;
  const generated = {
    ...config,
    main: path.resolve(root, String(config.main)),
    assets: { ...config.assets, directory: path.resolve(root, "public") },
    d1_databases: config.d1_databases?.map((database: { migrations_dir?: string; [key: string]: unknown }) => ({ ...database, ...(database.migrations_dir ? { migrations_dir: path.resolve(root, database.migrations_dir) } : {}) })),
    vars: { ...config.vars, ...testVars, ...(profile ? { SLATE_PROFILE: profile } : {}) },
    // Producers stay so code that enqueues still works; miniflare's real consumer
    // does not start, because a job a test leaves on the queue is then delivered
    // through the pool's module runner and can hang the run (gr-base-215).
    // SLATE_TEST_QUEUE_CONSUMERS=1 opts a run in to the real consumer.
    queues: process.env.SLATE_TEST_QUEUE_CONSUMERS === "1" ? config.queues : { ...config.queues, consumers: undefined },
  };
  mkdirSync(path.join(root, GENERATED_DIR), { recursive: true });
  writeFileSync(path.join(root, GENERATED_DIR, filename), JSON.stringify(generated, null, 2));
  return `./${GENERATED_DIR}/${filename}`;
}
