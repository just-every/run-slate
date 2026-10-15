import { withDemo } from "../modules/demo/index.mjs";
import { seedDemo, demoOwner } from "./demo";
import {editorHeaders} from "./core/app/editor-config";
import { publicDocumentLimit } from "./core/app/http-security";
import { consumeJobs, scheduledJobs } from "./core/app/background";
import start from "@tanstack/react-start/server-entry";
import { createApi, isHonoRequest } from "./core/app/hono";
import { operatorDocumentGate } from "./core/app/operator-document-gate";
import { configurationFailureResponse, runtimeConfigFor, assertStoredConfiguration } from "./core/app/runtime-gate";
import type { AppBindings } from "./core/app/types";
import { requireBindings } from "./core/platform/bindings.server";
import { staticAssetResponse } from "./base/runtime/static-assets";
import { lobbyResponse } from "./base/runtime/lobby";
import { setupStateResponse } from "./base/runtime/setup-state";
import { claimed, identity } from "./identity";
import { slateDependencyResponse } from "./core/features/session/dependencies";

const api = createApi();

/**
 * One Worker. Base deploys it with `run_worker_first`, so the Worker receives
 * every request and a GET or HEAD for a built client file or public icon is
 * answered from the `ASSETS` binding first through Base's `staticAssetResponse`,
 * which never looks up private paths. Hono answers its declared HTTP
 * families next, the deployment's configuration is checked next so every
 * document and generated server-function
 * request shares `/health`'s BASE-SECRET-002 answer, then Base's shared
 * `/setup/state` and the Lobby at `/` (HOME-001) answer, then the native anonymous
 * `/app` document response runs, and TanStack Start owns every remaining
 * document plus its generated `/_serverFn/` transport.
 *
 * Native queue, cron and page collaboration exports delegate to their domain owners.
 */
export default withDemo({
  async queue(batch,bindings:AppBindings){ await consumeJobs(batch,bindings); },
  async scheduled(_event,bindings:AppBindings){ await scheduledJobs(bindings); },
  async fetch(request, bindings: AppBindings, execution): Promise<Response> {
    return editorHeaders(withDocumentNoTransform(await handleRequest(request, bindings, execution)), bindings);
  },
} satisfies ExportedHandler<AppBindings>, { seed: seedDemo, owner: demoOwner });

function withDocumentNoTransform(response: Response): Response {
  if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) return response;
  const headers = new Headers(response.headers);
  const directives = headers.get("cache-control");
  if (!directives?.split(",").some(directive => directive.trim().toLowerCase() === "no-transform")) {
    headers.set("cache-control", directives ? `${directives}, no-transform` : "no-transform");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Under `vite dev` the Worker also runs first, and `ASSETS` is Vite's dev
 * server: it serves the client modules (`/@vite/client`, `/@id/…`,
 * `/node_modules/.vite/…`) that built output never has, so every GET or HEAD
 * it answers is passed through. Built output uses Base's `staticAssetResponse`.
 */
async function developmentAsset(request: Request, bindings: AppBindings): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const asset = await bindings.ASSETS.fetch(request);
  if (asset.status !== 404) return asset;
  await asset.body?.cancel();
  return null;
}

async function handleRequest(request: Request, bindings: AppBindings, execution: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const asset = import.meta.env.DEV ? await developmentAsset(request, bindings) : await staticAssetResponse(request, bindings);
    if (asset) return asset;
    const checkedBindings = requireBindings(bindings);

    if (isHonoRequest(url.pathname)) {
      return api.fetch(request, checkedBindings, execution);
    }

    let runtimeConfig;
    try {
      runtimeConfig = runtimeConfigFor(checkedBindings, url.hostname);
      await assertStoredConfiguration(checkedBindings);
    } catch (cause) {
      return configurationFailureResponse(cause);
    }

    const dependency = await slateDependencyResponse(request, checkedBindings.DB, runtimeConfig);
    if (dependency) return dependency;

    const limited=await publicDocumentLimit(request,checkedBindings.DB);
    if(limited)return limited;
    const installation = { DB: checkedBindings.DB, AUTH_ORIGIN: new URL(runtimeConfig.appUrl!).origin };
    const state = await setupStateResponse(request, installation, claimed);
    if (state) return state;
    const lobby = await lobbyResponse(request, installation, identity, claimed);
    if (lobby) return lobby;
    const gate = await operatorDocumentGate(request, url, checkedBindings, runtimeConfig);
    if (gate) return gate;

    return start.fetch(request);
}

export { ContentCollaboration } from "./core/features/collaboration/durable-object";
export type { AppType } from "./core/app/hono";
