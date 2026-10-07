import { createFileRoute } from "@tanstack/react-router";
import { OwnerLanding } from "../core/features/workspace/ui/OwnerLanding";

/**
 * HOME-001. The owner identity plate is rendered per request rather than
 * prerendered: it reads the buyer's `src/ext/config.ts` identity, which is a
 * deployment's own configuration rather than a deployment-invariant document.
 * `deploy/REQUEST-OWNERSHIP.md` records the decision.
 */
export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Slate" }] }),
  component: OwnerLanding,
});
