import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Outlet, RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { expect, test } from "vitest";
import { FirstRunShell } from "../../src/core/app/ui/FirstRunShell";
import { WorkspaceProvider } from "../../src/core/app/ui/WorkspaceContext";
import type { WorkspaceSnapshot } from "../../src/core/app/ui/workspaceSnapshot";

test("the first-run page shows the card mark beside the owner's name for the product and the signed-in owner's address", async () => {
  const snapshot = {
    member: { id: "member", workspaceId: "workspace", workspaceName: "Northwind", email: "rosa@example.com", displayName: "Rosa", initials: "R", role: "owner" },
    workspace: { name: "Northwind" }, setup: { required: true, canComplete: true }, navigation: {}, profile: { profile: "core-wiki" },
  } as unknown as WorkspaceSnapshot;
  const root = createRootRoute({ component: () => createElement(WorkspaceProvider, { snapshot, children: createElement(Outlet) }) });
  const home = createRoute({ getParentRoute: () => root, path: "/", component: () => null });
  const app = createRoute({ getParentRoute: () => root, path: "/app", component: FirstRunShell });
  const router = createRouter({ routeTree: root.addChildren([home, app]), history: createMemoryHistory({ initialEntries: ["/app"] }) });
  await router.load();
  const html = renderToString(createElement(RouterProvider, { router }));
  const link = html.match(/<a[^>]*class="paper-brand"[^>]*>([\s\S]*?)<\/a>/);
  expect(link, "home link renders").not.toBeNull();
  const mark = link![1].match(/^<svg[^>]*aria-hidden="true"[\s\S]*?<\/svg>/);
  expect(mark, "decorative SlateMark svg leads the lockup").not.toBeNull();
  expect(mark![0].match(/<rect /g)).toHaveLength(2);
  expect(mark![0].match(/transform="rotate\(-20 31 24\)"/g)).toHaveLength(1);
  expect(html).toMatch(/data-testid="member-email"[^>]*>[\s\S]*rosa@example\.com/);
  expect(html).not.toContain("Northwind");
});
