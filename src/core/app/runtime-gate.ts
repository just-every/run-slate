import { isLoopbackHostname } from "../platform/auth/paths";
import { readRuntimeConfig, RuntimeConfigurationError, type RuntimeConfig } from "../platform/config/runtime";
import { error } from "../shared/errors";
import type { AppBindings } from "./types";

/**
 * BASE-SECRET-002. Every request family resolves the deployment's configuration
 * through this one function before it proceeds: Hono in its first middleware,
 * and `src/server.ts` before the operator document gate, Start and its generated
 * transport. A misconfigured deployment therefore answers a document and a
 * server-function request exactly as it answers `/health`, rather than
 * rendering or serialising private data behind a failing health check.
 */
export function runtimeConfigFor(bindings: AppBindings, hostname: string): RuntimeConfig {
  return readRuntimeConfig(bindings, isLoopbackHostname(hostname));
}

/** Rethrows anything that is not a configuration failure. */
export function configurationFailureResponse(cause: unknown): Response {
  if (!(cause instanceof RuntimeConfigurationError)) throw cause;
  return Response.json(error("CONFIGURATION_INVALID", cause.message), { status: 503 });
}

/** Stored integrations cannot silently lose their decryption key on restart. */
export async function assertStoredConfiguration(bindings:AppBindings):Promise<void> {
  if(bindings.CONNECTOR_CREDENTIALS_KEY?.trim().length && bindings.CONNECTOR_CREDENTIALS_KEY.trim().length>=32)return;
  const connected=await bindings.DB.prepare("SELECT 1 AS present FROM chat_connections WHERE state IN ('connected','needs-attention') UNION ALL SELECT 1 AS present FROM provider_folder_connections WHERE state='connected' UNION ALL SELECT 1 AS present FROM backup_destinations WHERE state='connected' UNION ALL SELECT 1 AS present FROM federation_connections WHERE state IN ('connected','needs-attention') LIMIT 1").first();
  if(connected)throw new RuntimeConfigurationError('CONNECTOR_CREDENTIALS_KEY must contain at least 32 characters while stored connections exist.');
}
