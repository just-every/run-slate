import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { zipSync } from "fflate";
import { buildServerDcBlueprint } from "./scripts/import-scale/generate-server-dc.ts";
import { docsSite } from "./src/core/features/docs/build/plugin.ts";
import { resolveVitestWranglerConfigPath } from "./tests/e2e/setup/wrangler-config.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const migrations = await readD1Migrations(path.join(root, "migrations/core"));

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: { TEST_MIGRATIONS: migrations },
        d1Databases: { PRIOR_DB: "inquiry-before-admission" },
        serviceBindings: {
          // Serve committed binary fixtures from Node without transforming them
          // into enormous JavaScript modules in the Workers runner.
          TEST_IMPORT_FIXTURES: async (request) => {
            const name = new URL(request.url).pathname.slice(1);
            const names = ["notion-workspace-export.zip", "confluence-space-export.zip", "google-docs-download.docx"];
            // The committed scale generator's Server/DC archive, built in memory.
            if (name === "server-dc-entities-scale.zip") {
              const entries = buildServerDcBlueprint(root, "server-dc-entities", "scale-reader@example.test").entries;
              return new Response(zipSync(Object.fromEntries(entries.map((entry) => [entry.path, entry.source as Uint8Array]))), { headers: { "Content-Type": "application/octet-stream" } });
            }
            const fixture = name === "word-government-impact-assessment.docx"
              ? path.join(root, "tests/flagship/federation/fixtures", name)
              : names.includes(name) ? path.join(root, "tests/e2e/imports/fixtures/real", name) : null;
            if (!fixture) return new Response("Unknown import fixture", { status: 404 });
            const bytes = await readFile(fixture);
            return new Response(bytes, { headers: { "Content-Type": "application/octet-stream" } });
          },
        },
      },
      wrangler: { configPath: resolveVitestWranglerConfigPath(root, 'flagship') },
    }),
    // The /docs routes import the docs virtual modules (DOCS-001).
    docsSite(),
    // `src/server.ts` is a TanStack Start entry: it imports
    // `#tanstack-router-entry` and `#tanstack-start-entry`, which only the Start
    // Vite plugin supplies. Without it the pool cannot even load the Worker.
    tanstackStart({ prerender: { enabled: false, autoStaticPathsDiscovery: false, crawlLinks: false, failOnError: true } }),
    react(),
  ],
  test: {
    // Each Workers file owns D1/R2 state; avoid competing native runtimes on shared builders.
    maxWorkers: 1,
    // Cold native D1/R2 journeys need a harness budget beyond Vitest's 5s default.
    // Product deadline assertions and explicit per-test budgets remain unchanged.
    testTimeout: 30_000,
    include: ["tests/e2e/**/*.test.ts", "tests/flagship/**/*.test.ts",
      // Guest policy acceptance shares the existing invitation journey.
      "tests/qualification/policies/invitations.test.ts",
      // Exact existing supporting suites registered by tests/requirements/test-evidence.json.
      "tests/qualification/authority/atomic-recovery.test.ts",
      "tests/qualification/authority/disconnect.test.ts",
      "tests/qualification/authority/import-safety.test.ts",
      "tests/qualification/authority/learned-provenance.test.ts",
      "tests/qualification/authority/recovery.test.ts",
      "tests/qualification/authority/skill-disclosure.test.ts",
      "tests/qualification/authority/snapshot.test.ts",
      "tests/qualification/authority/decision-authority.test.ts",
      "tests/qualification/authority/native-boundaries.test.ts",
      "tests/qualification/release-restore-authority/restored-effects.test.ts",
      "tests/qualification/release-integration-repairs/*.test.ts",
    ],
    // Still written against `node:test` and run by `pnpm test:platform`. Delete
    // each entry as its suite is rewritten as Workers-runtime clause journeys.
    exclude: [
      "tests/e2e/platform-adapters.test.ts",
      // Node test assertions run unchanged through test:platform.
      "tests/e2e/search/search-location.test.ts",
      // These use node:test; test:frontend executes them without changing assertions.
      "tests/flagship/frontend/*.test.ts",
    ],
    setupFiles: ["./tests/e2e/setup/apply-migrations.ts"],
    // A clause journey that asserts nothing must never report its clause
    // satisfied. An empty body is a failure, not a pass.
    expect: { requireAssertions: true },
  },
});
