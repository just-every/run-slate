import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "../core/app/ui/AppShell";
import { loadWorkspace } from "../core/app/loaders";

/**
 * The operator app layout. A raw anonymous `/app` request never reaches here:
 * `operatorDocumentGate` in the Worker answers it with the native 302 first.
 * This gate covers client navigation and a session that lapses mid-session, and
 * the identity RPC redirects to the safe `/app` entry. The native document gate
 * preserves the requested operator path and query when it issues a redirect.
 */
export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    const workspace = await loadWorkspace();
    return { workspace };
  },
  head: () => ({ meta: [{ title: "Workspace — Slate" }] }),
  component: AppLayout,
});

function AppLayout() {
  const { workspace } = Route.useRouteContext();
  return (
    <AppShell snapshot={workspace}>
      <Outlet />
    </AppShell>
  );
}
