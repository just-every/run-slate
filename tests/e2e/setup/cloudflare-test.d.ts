import type { D1Migration } from "@cloudflare/vitest-pool-workers";
import type { AppBindings } from "../../../src/core/app/types";

/**
 * `wrangler types` writes `worker-configuration.d.ts` from a generated
 * `wrangler.toml`, so it is gitignored and absent on a clean clone. The Worker's
 * own binding type is the single source of truth instead; `TEST_MIGRATIONS` is
 * supplied by `vitest.config.ts` and exists only in tests.
 */
declare global {
  namespace Cloudflare {
    interface Env extends AppBindings {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
