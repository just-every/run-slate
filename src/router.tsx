import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/** A new router instance is required for each server request. */
export function getRouter() {
  return createRouter({ routeTree, scrollRestoration: true, defaultPreload: "intent" });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
