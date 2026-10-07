import { publicDocumentLimit } from "./core/app/http-security";
import { consumeJobs, scheduledJobs } from "./core/app/background";
import start from "@tanstack/react-start/server-entry";
import { createApi, isHonoRequest } from "./core/app/hono";
import { operatorDocumentGate } from "./core/app/operator-document-gate";
import { configurationFailureResponse, runtimeConfigFor, assertStoredConfiguration } from "./core/app/runtime-gate";
import type { AppBindings } from "./core/app/types";
import { requireBindings } from "./core/platform/bindings.server";

const api = createApi();

/**
 * One Worker. Hono answers its declared HTTP families first, the deployment's
 * configuration is checked next so every document and generated server-function
 * request shares `/health`'s BASE-SECRET-002 answer, then the native anonymous
 * `/app` document response runs, and TanStack Start owns every remaining
 * document plus its generated `/_serverFn/` transport.
 *
 * Native queue, cron and page collaboration exports delegate to their domain owners.
 */
export default {
  async queue(batch,bindings:AppBindings){ await consumeJobs(batch,bindings); },
  async scheduled(_event,bindings:AppBindings){ await scheduledJobs(bindings); },
  async fetch(request, bindings: AppBindings, execution): Promise<Response> {
    const url = new URL(request.url);
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

    const limited=await publicDocumentLimit(request,checkedBindings.DB);
    if(limited)return limited;
    const gate = await operatorDocumentGate(request, url, checkedBindings, runtimeConfig);
    if (gate) return gate;

    return start.fetch(request);
  },
} satisfies ExportedHandler<AppBindings>;

export { ContentCollaboration } from "./core/features/collaboration/durable-object";
export type { AppType } from "./core/app/hono";
