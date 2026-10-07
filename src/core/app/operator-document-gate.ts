import { createSessionService } from "../features/session";
import { safeAppPath } from "../platform/auth/paths";
import type { RuntimeConfig } from "../platform/config/runtime";
import type { AppBindings } from "./types";

function isOperatorDocument(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

/**
 * The native anonymous operator-document response, run before TanStack Start so
 * that the raw `/app` request keeps its 302 and safe `next` semantics. It does
 * not authorize RPC: every private server function revalidates the session in
 * its own handler.
 */
export async function operatorDocumentGate(
  request: Request,
  url: URL,
  bindings: AppBindings,
  runtimeConfig: RuntimeConfig,
): Promise<Response | null> {
  if (!isOperatorDocument(url.pathname)) return null;

  const member = await createSessionService(bindings.DB, runtimeConfig.sessionSecret).authenticate(request.headers);
  if (member) return null;

  const next = safeAppPath(`${url.pathname}${url.search}`);
  return new Response(null, { status: 302, headers: { location: `/signin?next=${encodeURIComponent(next)}` } });
}
