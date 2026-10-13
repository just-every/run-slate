import { applyD1Migrations, env, reset } from "cloudflare:test";

/**
 * Start an independent deployment for each journey. The Workers pool retains
 * binding data between tests in a file, but WORK-001 permits one workspace per
 * deployment. Keeping earlier fixtures makes later sessions belong to a second
 * tenant, which the native authentication boundary correctly refuses.
 *
 * Reset the bindings and reapply migrations so singleton defaults, triggers,
 * files and collaboration rooms have the same state as a fresh installation.
 */
export async function resetDeployment(): Promise<void> {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
}
