import { withDemo } from "../modules/demo/index.mjs";
import {editorHeaders} from "./core/app/editor-config";
import type { AppBindings } from "./core/app/types";
import { staticAssetResponse } from "./base/runtime/static-assets";
import { healthResponse } from "./core/app/health-response";

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
  async queue(batch,bindings:AppBindings){ await (await import("./core/app/background")).consumeJobs(batch,bindings); },
  async scheduled(_event,bindings:AppBindings){ await (await import("./core/app/background")).scheduledJobs(bindings); },
  async fetch(request, bindings: AppBindings, execution): Promise<Response> {
    return editorHeaders(withDocumentNoTransform(await handleRequest(request, bindings, execution), request), bindings);
  },
} satisfies ExportedHandler<AppBindings>, { seed: async (bindings: AppBindings, context: {ownerEmail:string;now:Date}) => (await import("./demo")).seedDemo(bindings, context), owner: async (bindings: AppBindings) => (await import("./demo")).demoOwner(bindings) });

function withDocumentNoTransform(response: Response, request: Request): Response {
  if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) return response;
  const headers = new Headers(response.headers);
  const path=new URL(request.url).pathname;
  if(path==='/app'||path.startsWith('/app/')||path==='/setup')headers.set('cache-control','no-store');
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
    if (url.pathname === "/health" && (request.method === "GET" || request.method === "HEAD")) {
      const response = await healthResponse(request, bindings, execution);
      return request.method === "HEAD" ? new Response(null, response) : response;
    }
    const asset = import.meta.env.DEV ? await developmentAsset(request, bindings) : await staticAssetResponse(request, bindings);
    if (asset) {
      // Vite's content-addressed files change URL when their bytes change.
      // Documents and data keep their existing freshness rules.
      if (/^\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.(?:js|css)$/.test(url.pathname) && [200,304].includes(asset.status)) {
        const headers=new Headers(asset.headers);
        headers.set('Cache-Control','public, max-age=31536000, immutable');
        return new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers});
      }
      return asset;
    }
    return (await import("./core/app/request-handler")).handleApplicationRequest(request, bindings, execution);
}

export { ContentCollaboration } from "./core/features/collaboration/durable-object";
export type { AppType } from "./core/app/hono";
