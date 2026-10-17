import type { AppBindings } from "./types";
import { requireBindings } from "../platform/bindings.server";
import { publicDocumentLimit } from "./http-security";
import { isHonoRequest } from "./hono-paths";
import { operatorDocumentGate } from "./operator-document-gate";
import { configurationFailureResponse, runtimeConfigFor, assertStoredConfiguration } from "./runtime-gate";
import { lobbyResponse } from "../../base/runtime/lobby";
import { managedLobby } from "./managed-lobby";
import { setupStateResponse } from "../../base/runtime/setup-state";
import { claimed, identity } from "../../identity";
import { slateDependencyResponse } from "../features/session/dependencies";

let api: Promise<ReturnType<typeof import("./hono").createApi>> | undefined;
/** Assets have already answered before this application graph is loaded. */
export async function handleApplicationRequest(request: Request, bindings: AppBindings, execution: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const checkedBindings = requireBindings(bindings);

    if (isHonoRequest(url.pathname)) {
      api ??= import("./hono").then(module => module.createApi());
      return (await api).fetch(request, checkedBindings, execution);
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
    if (lobby) return managedLobby(lobby, runtimeConfig);
    const gate = await operatorDocumentGate(request, url, checkedBindings, runtimeConfig);
    if (gate) return gate;

    return (await import("@tanstack/react-start/server-entry")).default.fetch(request);
}
