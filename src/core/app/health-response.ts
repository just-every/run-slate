import { deploymentHealth } from "../../base/runtime/deployment-health";
import { probeDependencies, type DependencyHealth } from "../platform/health";
import { RuntimeConfigurationError } from "../platform/config/runtime";
import { error } from "../shared/errors";
import { assertStoredConfiguration, runtimeConfigFor } from "./runtime-gate";
import type { AppBindings } from "./types";

const refreshInterval = 30_000;
// Leave room for the managed monitor's minute-spaced requests and jitter.
const maximumAge = 120_000;
const probeTimeout = 5_000;

interface HealthState {
  files: R2Bucket;
  jobs: Queue;
  connectorKey: string | undefined;
  expiresAt: number;
  attemptedAt: number;
  checks?: DependencyHealth;
  configurationFailure?: RuntimeConfigurationError;
  refreshing?: Promise<void>;
  rateWindow: number;
  addresses: Map<string, number>;
}

// Binding identity keeps installations and replaced dependencies separate.
const states = new WeakMap<D1Database, HealthState>();

function stateFor(bindings: AppBindings): HealthState {
  let state = states.get(bindings.DB);
  if (!state || state.files !== bindings.FILES || state.jobs !== bindings.JOBS || state.connectorKey !== bindings.CONNECTOR_CREDENTIALS_KEY) {
    state = { files: bindings.FILES, jobs: bindings.JOBS, connectorKey: bindings.CONNECTOR_CREDENTIALS_KEY,
      // Startup readiness comes from present native bindings. It must be
      // confirmed by the first probe within five seconds, even if that hangs.
      checks: { database: { status: "reachable" }, files: { status: "reachable" } },
      expiresAt: Date.now() + probeTimeout, attemptedAt: -Infinity, rateWindow: -1, addresses: new Map() };
    states.set(bindings.DB, state);
  }
  return state;
}

function refresh(state: HealthState, bindings: AppBindings): Promise<void> {
  state.attemptedAt = Date.now();
  // Defer all I/O to the execution context; even a cold health response never waits.
  return Promise.resolve().then(async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const checks = await Promise.race([
        Promise.all([
          assertStoredConfiguration(bindings),
          probeDependencies({ database: bindings.DB, files: bindings.FILES, jobs: bindings.JOBS }),
        ]).then(([, checks]) => checks),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Health probe timed out.")), probeTimeout); }),
      ]);
      state.checks = checks;
      state.configurationFailure = undefined;
      state.expiresAt = Date.now() + maximumAge;
    } catch (cause) {
      state.checks = undefined;
      state.configurationFailure = cause instanceof RuntimeConfigurationError ? cause : undefined;
    } finally {
      clearTimeout(timer);
      state.refreshing = undefined;
    }
  });
}

/**
 * No storage or outbound calls are awaited here. Startup binding readiness has
 * five seconds to be confirmed by a probe. Active probes refresh every 30 s;
 * failures/timeouts clear success, and evidence older than two minutes is never trusted.
 * Thus the next health read after that bound fails even if a refresh is stuck.
 */
export function healthResponse(request: Request, bindings: AppBindings, execution: Pick<ExecutionContext, "waitUntil">): Response {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin" };
  try {
    runtimeConfigFor(bindings, new URL(request.url).hostname);
  } catch (cause) {
    if (!(cause instanceof RuntimeConfigurationError)) throw cause;
    return Response.json(error("CONFIGURATION_INVALID", cause.message), { status: 503, headers });
  }
  if (!bindings.DB || !bindings.FILES || !bindings.JOBS) {
    return Response.json(error("DEPENDENCY_UNAVAILABLE", "A Slate dependency is unavailable."), { status: 503, headers });
  }
  const now = Date.now();
  const state = stateFor(bindings);
  // Health's old database-backed limit would defeat a memory-only response.
  // Keep its 120/minute protection locally, with bounded address storage.
  const window = Math.floor(now / 60_000);
  if (state.rateWindow !== window) { state.rateWindow = window; state.addresses.clear(); }
  const address = request.headers.get("cf-connecting-ip") ?? "local";
  const count = (state.addresses.get(address) ?? 0) + 1;
  if (count > 120 || (!state.addresses.has(address) && state.addresses.size >= 1024)) {
    return Response.json(error("RATE_LIMITED", "Too many requests. Try again later."), { status: 429, headers: { ...headers, "Retry-After": "60" } });
  }
  state.addresses.set(address, count);
  if (!state.refreshing && now - state.attemptedAt >= refreshInterval) {
    state.refreshing = refresh(state, bindings);
    execution.waitUntil(state.refreshing);
  }
  if (state.configurationFailure) {
    return Response.json(error("CONFIGURATION_INVALID", state.configurationFailure.message), { status: 503, headers });
  }
  if (!state.checks || now >= state.expiresAt) {
    return Response.json(error("DEPENDENCY_UNAVAILABLE", "A Slate dependency is unavailable."), { status: 503, headers });
  }
  return Response.json({ status: "ok", checks: state.checks, ...deploymentHealth(bindings) }, { headers });
}
