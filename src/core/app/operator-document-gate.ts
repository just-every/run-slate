import { createSessionService } from "../features/session/service";
import { sessionOptions } from "../features/session/service";
import { safeAppPath } from "../platform/auth/paths";
import type { RuntimeConfig } from "../platform/config/runtime";
import type { AppBindings } from "./types";

function isOperatorDocument(pathname: string): boolean {
  return pathname === "/setup" || pathname === "/app" || pathname.startsWith("/app/");
}

/**
 * The native anonymous operator-document response, run before TanStack Start so
 * that raw `/app` and `/setup` requests keep their 302 and safe `next` semantics. It does
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

  const member = await createSessionService(bindings.DB, sessionOptions(runtimeConfig)).authenticate(request);
  if (member) return null;

  const next = safeAppPath(`${url.pathname}${url.search}`);
  return new Response(null, { status: 302, headers: { location: `/signin?next=${encodeURIComponent(next)}` } });
}
