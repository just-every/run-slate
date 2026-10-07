import { applyD1Migrations, env } from "cloudflare:test";

// Every contract test runs against local D1 with `migrations/core/` applied.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
