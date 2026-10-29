import type { Context } from "hono";
import { AuthError, type StepUpAction } from "../../../../modules/operator-auth/index.mjs";
import { STEP_UP_SECONDS } from "../../../../modules/operator-auth/identity/email-link/index.mjs";
import type { AppEnvironment } from "../../app/types";
import { ApiProblem } from "../../app/problems";
import { safeAppPath } from "../../platform/auth/paths";
import { createSlateAuth } from "./auth";

const POST = (request: Request) => request.method === "POST" ? request : new Request(request.url, { method: "POST", headers: request.headers });

/**
 * Base step-up for a sensitive operation: the asking session must hold an
 * app-local email proof from the last ten minutes. Without one, Slate emails a
 * confirmation link to the member's own address and refuses this attempt; the
 * link returns to the page the member was on. The operation's commit repeats
 * the proof check (`FeatureContext.stepUp`).
 */
export async function requireStepUp(c: Context<AppEnvironment>, action: StepUpAction): Promise<void> {
  const agent=c.get('companyAgent');
  if(agent) {
    if(!agent.stepUp)throw new ApiProblem(403,'STEP_UP_REQUIRED','Complete the native authentication handoff.');
    c.set('stepUp',agent.stepUp);
    return;
  }
  const { auth } = await createSlateAuth(c.env.DB, c.get("runtimeConfig"));
  try {
    const session = await auth.requireStepUp(c.req.raw, action);
    c.set("stepUp", { sessionId: session.id, since: Date.now() - STEP_UP_SECONDS * 1000 });
    return;
  } catch (cause) {
    if (!(cause instanceof AuthError) || cause.code !== "step_up_required") throw problem(cause);
  }
  const referer = c.req.header("referer");
  const returnTo = safeAppPath(referer && new URL(referer).origin === new URL(c.req.url).origin ? new URL(referer).pathname + new URL(referer).search : null);
  try { await auth.requestStepUp(POST(c.req.raw), { action, returnTo }); }
  catch (cause) { throw problem(cause); }
  throw new ApiProblem(403, "STEP_UP_REQUIRED", "Confirm this with your email first. Slate sent a confirmation link to your address. Open it, then try again within 10 minutes.");
}

function problem(cause: unknown): unknown {
  if (!(cause instanceof AuthError)) return cause;
  if (cause.code === "unauthenticated") return new ApiProblem(401, "UNAUTHENTICATED", "A valid session is required.");
  if (cause.code === "rate_limited") return new ApiProblem(429, "RATE_LIMITED", "Too many confirmation emails. Try again later.");
  if (cause.code === "mail_unavailable") return new ApiProblem(503, "MAIL_NOT_SENT", "The confirmation email could not be sent.");
  if (cause.code === "authority_changed") return new ApiProblem(409, "AUTHORITY_CHANGED", "Your access changed. Sign in again.");
  return new ApiProblem(403, "STEP_UP_REQUIRED", "This action needs a fresh email confirmation from this Slate address.");
}
