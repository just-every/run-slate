import { env } from "cloudflare:workers";
import type { AppBindings } from "../app/types";

const requiredBindings = ["DB", "FILES", "JOBS"] as const;

/**
 * The only reader of ambient Worker bindings. Start server functions run outside
 * the Hono request, so they resolve bindings here instead of from a context.
 */
export function requestBindings(): AppBindings {
  return requireBindings(env as unknown as AppBindings);
}

export function requireBindings(bindings: AppBindings): AppBindings {
  if (bindings?.RER_DEV_ORIGIN && bindings.LOCAL_DEVELOPMENT === "true") {
    bindings = { ...bindings, APP_URL: bindings.RER_DEV_ORIGIN };
  }
  const missing = requiredBindings.filter((name) => !bindings?.[name]);
  if (missing.length) {
    throw new Error(`Missing Worker bindings: ${missing.join(", ")}.`);
  }
  return bindings;
}
