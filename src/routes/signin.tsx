import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SignInPage } from "../core/features/session/ui/SignInPage";
import { safeAppPath } from "../core/platform/auth/paths";

const searchSchema = z.object({ next: z.string().optional() });

export const Route = createFileRoute("/signin")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Sign in — Slate" }] }),
  component: SignIn,
});

function SignIn() {
  return <SignInPage next={safeAppPath(Route.useSearch().next)} />;
}
