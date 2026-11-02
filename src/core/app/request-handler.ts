import { previewDocument } from "./preview-document";
import type { AppBindings } from "./types";
import { requireBindings } from "../platform/bindings.server";
import { publicDocumentLimit } from "./http-security";
import { isHonoRequest } from "./hono-paths";
import { operatorDocumentGate } from "./operator-document-gate";
import { configurationFailureResponse, runtimeConfigFor, assertStoredConfiguration } from "./runtime-gate";
import { lobbyHtml } from "../../base/runtime/lobby";
import { deploymentLine } from "../../base/runtime/identity";
import { notFoundResponse } from "../../base/runtime/rejected-response";
import { managedLobby } from "./managed-lobby";
import { admitted, setupState, setupStateResponse } from "../../base/runtime/setup-state";
import { claimed, identity } from "../../identity";
import { slateDependencyResponse } from "../features/session/dependencies";

let api: Promise<ReturnType<typeof import("./hono").createApi>> | undefined;
/** Assets have already answered before this application graph is loaded. */
export async function handleApplicationRequest(request: Request, bindings: AppBindings, execution: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const checkedBindings = requireBindings(bindings);

    if (isHonoRequest(url.pathname)) {
      api ??= import("./hono").then(module => module.createApi());
      return previewDocument(await (await api).fetch(request, checkedBindings, execution), checkedBindings);
    }

    const publicInstallation = url.pathname === "/" || url.pathname === "/setup/state";
    // Refuse foreign installation doors before configuration or data access,
    // including a local deployment asked for a non-loopback Host.
    if (publicInstallation && checkedBindings.APP_URL) {
      let origin: string | undefined;
      try { origin = new URL(checkedBindings.APP_URL).origin; } catch { /* The configuration gate reports an invalid URL. */ }
      if (origin && !admitted(request, origin)) {
        const response = await notFoundResponse(request);
        response.headers.set("cache-control", "no-store");
        return response;
      }
    }

    let runtimeConfig;
    try {
      runtimeConfig = runtimeConfigFor(checkedBindings, url.hostname);
      // The public installation doors must not inspect stored integrations.
      if (!publicInstallation) await assertStoredConfiguration(checkedBindings);
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
    const lobby = await installedLobbyResponse(request, installation);
    if (lobby) return previewDocument(await managedLobby(lobby, runtimeConfig), checkedBindings);
    const gate = await operatorDocumentGate(request, url, checkedBindings, runtimeConfig);
    if (gate) return gate;

    return (await import("@tanstack/react-start/server-entry")).default.fetch(request);
}

/** Shared Base markup, with Slate's state-only native custody and configured deployment line. */
async function installedLobbyResponse(request: Request, installation: { DB: D1Database; AUTH_ORIGIN: string }): Promise<Response | null> {
  if (new URL(request.url).pathname !== "/" || identity.installedHome !== "lobby") return null;
  const headers = new Headers({
    "cache-control": "no-store", "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff", "x-rer-document": "lobby",
  });
  if (request.method !== "GET" && request.method !== "HEAD") {
    headers.set("allow", "GET, HEAD");
    return new Response(null, { status: 405, headers });
  }
  let state;
  try { state = await setupState(installation.DB, claimed); }
  catch { return Response.json({ error: "setup_unavailable" }, { status: 503, headers }); }
  // Base's optional local owner hint reads a separate account ledger. Slate
  // owns native sessions and never supplies identity or session data here.
  const line = deploymentLine(identity).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
  const html = lobbyHtml(identity, state).replace(/<p class="line">[^<]*<\/p>/, () => `<p class="line">${line}</p>`);
  const style = html.match(/<style>([\s\S]*?)<\/style>/)![1];
  const digest = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(style)))));
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("content-security-policy", `default-src 'none'; style-src 'self' 'sha256-${digest}'; font-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
  return new Response(request.method === "HEAD" ? null : html, { headers });
}
