import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { WorkspaceSnapshot } from "./ui/workspaceSnapshot";

/**
 * Start statically imports this wrapper into route modules, so the true server
 * modules are imported inside the handler. The client receives a generated RPC
 * stub and no D1, session or binding code.
 *
 * BASE-ACCESS-002: this private server function validates the native session in
 * its own handler before it reads anything private. The `/app` document gate
 * does not stand in for it, because the transport request arrives outside
 * `/app`. A missing, expired or revoked session throws the identifiable Start
 * sign-in redirect protocol without returning any member record.
 */
export const loadWorkspace = createServerFn({ method: "GET" }).handler(async (): Promise<WorkspaceSnapshot> => {
  const [{ createSessionService }, { startRequestHeaders }, { requestBindings }, { runtimeConfigFor }, { getRequestUrl }] = await Promise.all([
    import("../features/session/service"),
    import("../platform/auth/start-request"),
    import("../platform/bindings.server"),
    import("./runtime-gate"),
    import("@tanstack/react-start/server"),
  ]);
  const bindings = requestBindings();
  // BASE-SECRET-002 has already refused a misconfigured deployment in
  // `src/server.ts`; this call is how the handler obtains the checked secret.
  const config = runtimeConfigFor(bindings, getRequestUrl().hostname);
  const member = await createSessionService(bindings.DB, config.sessionSecret).authenticate(startRequestHeaders());
  if (!member) throw redirect({ to: "/signin", search: { next: "/app" } });
  // Use the same authorized services as the API. Nothing private is read before
  // the current request's native session has been checked above.
  const [{ readWorkspace }, { firstRunState }, { navigation }] = await Promise.all([
    import("../features/workspace/settings"),
    import("../features/workspace/bootstrap"),
    import("../features/navigation/service"),
  ]);
  const context = { db: bindings.DB, files: bindings.FILES, jobs: bindings.JOBS, actor: member, now: new Date().toISOString() };
  const [workspace, setup, personalNavigation] = await Promise.all([
    readWorkspace(context), firstRunState(context), navigation(context),
  ]);
  return { member, workspace, setup, navigation: personalNavigation, profile: { profile: config.launchProfile ?? "core-wiki" } };
});
