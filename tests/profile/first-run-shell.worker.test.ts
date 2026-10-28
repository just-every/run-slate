import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Outlet, RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { expect, test } from "vitest";
import { env } from "cloudflare:test";
import { readRuntimeConfig } from "../../src/core/platform/config/runtime";
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

  const carriedName = "Example Business Co";
  const carry = JSON.stringify({ version: 1, origin: "https://example.test", business_id: "synthetic-slate-1", business_url: "https://example.test/business/synthetic-slate-1", name: carriedName, legal_name: null, accent: null, logo_url: null, refreshed_at: "2026-10-27T09:00:00.000Z" });
  snapshot.business = readRuntimeConfig({ ...env, RER_BUSINESS: carry }, false).business;
  const carriedHtml = renderToString(createElement(RouterProvider, { router }));
  expect(carriedHtml).toMatch(new RegExp(`<input[^>]*value="${carriedName}"`));
  expect(carriedHtml).not.toContain("Northwind");
  const longName = "Example Business ".repeat(12);
  snapshot.business = readRuntimeConfig({ ...env, RER_BUSINESS: JSON.stringify({ ...JSON.parse(carry), name: longName }) }, false).business;
  const longHtml = renderToString(createElement(RouterProvider, { router }));
  expect(longHtml).toContain(`value="${longName.slice(0, 160)}"`);
  expect(longHtml).not.toContain(`value="${longName}"`);
  for (const bindings of [{ ...env, RER_BUSINESS: "{" }, { ...env, RER_BUSINESS: carry, RER_DEMO: "1" }]) {
    snapshot.business = readRuntimeConfig(bindings, false).business;
    const withoutBusiness = renderToString(createElement(RouterProvider, { router }));
    expect(withoutBusiness).toMatch(/<input[^>]*value=""/);
    expect(withoutBusiness).not.toContain(carriedName);
  }
});
