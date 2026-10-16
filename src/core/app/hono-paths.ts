import { SESSION_AUTH_PATHS } from "../features/session/paths";

/**
 * The HTTP families this Worker answers with Hono. `src/server.ts` consults it
 * before TanStack Start, so it must never claim `/_serverFn/`, a React document,
 * or a catch-all.
 */
export function isHonoRequest(pathname: string): boolean {
  return SESSION_AUTH_PATHS.has(pathname)
    || pathname === "/health"
    || pathname === "/api"
    || pathname.startsWith("/api/")
    || pathname === "/p"
    || pathname.startsWith("/p/");
}
