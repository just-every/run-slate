import { ownerClaim } from "./owner-claim";
import { Hono } from "hono";
import { z } from "zod";
import { AuthError } from "../../../../modules/operator-auth/index.mjs";
import { confirmationResponse } from "../../../../modules/operator-auth/identity/email-link/confirmation.mjs";
import type { AppEnvironment } from "../../app/types";
import { ApiProblem } from "../../app/problems";
import { error } from "../../shared/errors";
import { sessionDigest } from "../../platform/auth/token";
import { createSlateAuth, PROVIDER_CALLBACK, PROVIDER_START, slateSessions } from "./auth";
import { acceptInvitation, previewInvitation } from "../workspace/invitations";
import { invitationAcceptedPage, invitationPage } from "../workspace/invitation-page";
import { bootstrapOwner } from "../workspace/bootstrap";
import { parseBody } from "../workspace/routes";
import { signInCapabilities, storedSignInCapabilities } from "./capabilities";
import { mailStatus } from "./mail-status";
import type { MailRow } from "./mail-authority";
import { completeNativeLocalSetup, LOCAL_SETUP_PATH } from "./local-setup";

const branding = { productName: "Slate", accentColor: "#1b1b18", signInPath: "/signin", theme: "/rer-theme.css" };
const retiredLink = (method: string) => confirmationResponse({ branding, preview: null, token: "", method });
/** Paths Base operator-auth owns on Slate's listener: owner claim, confirmation, step-up and the incumbent provider. */
export const BASE_AUTH_PATHS = new Set(["/auth/bootstrap", "/auth/confirm", "/auth/step-up", PROVIDER_START, PROVIDER_CALLBACK]);
export const SESSION_AUTH_PATHS = new Set([...BASE_AUTH_PATHS, LOCAL_SETUP_PATH, "/auth/owner-claim"]);
const invitationToken = z.string().min(20).max(512);
const requestDigest = (secret: string, email: string, key: string) => sessionDigest(secret, `mail-request:${email.toLowerCase()}:${key}`);

function authProblem(cause: unknown, failure?: string): never {
  if (!(cause instanceof AuthError)) throw cause;
  if (cause.code === "mail_unavailable") throw new ApiProblem(502, "MAIL_NOT_SENT", failure ? `The sign-in email was not sent: ${failure}.` : "The sign-in email could not be sent.");
  if (cause.code === "rate_limited") throw new ApiProblem(429, "RATE_LIMITED", "Too many sign-in requests. Try again later.");
  if (cause.code === "invalid_email") throw new ApiProblem(400, "INVALID_REQUEST", "Enter a valid email address.");
  throw new ApiProblem(cause.status as ConstructorParameters<typeof ApiProblem>[0], cause.code.toUpperCase(), "Sign-in could not be completed.");
}

export function createSessionRoutes() {
  return new Hono<AppEnvironment>()
    .all("/auth/owner-claim", c => ownerClaim(c.req.raw, c.env, c.get("runtimeConfig")))
    .all(LOCAL_SETUP_PATH, async c => {
      try { return c.json(await completeNativeLocalSetup(c.req.raw, c.env.DB, c.get("runtimeConfig"), c.env.SESSION_SECRET!)); }
      catch (cause) { authProblem(cause); }
    })
    .get("/api/auth/capabilities", async (context) => context.json(await storedSignInCapabilities(context.env.DB, context.get("runtimeConfig"))))
    .post("/api/auth/magic", async c => {
      const schema = z.object({ email: z.string().email().max(254), requestKey: z.string().min(32).max(160).optional() }).strict();
      const form = c.req.header("content-type")?.split(";", 1)[0]!.trim().toLowerCase() === "application/x-www-form-urlencoded";
      const input = form ? schema.parse(await c.req.parseBody({ all: true })) : await parseBody(c.req, schema);
      const config = c.get("runtimeConfig");
      // The configured setup mailbox claims an empty installation; it still must prove possession.
      await bootstrapOwner(c.env.DB, config, input.email);
      // A no-script form has no status key of its own; a server key still records its delivery for Settings.
      const requestKey = input.requestKey ?? (form ? crypto.randomUUID() : undefined);
      const delivery = { requestDigest: requestKey ? await requestDigest(config.sessionSecret, input.email, requestKey) : undefined, failure: undefined as string | undefined };
      const { auth } = await createSlateAuth(c.env.DB, config, { delivery });
      try { await auth.requestMagicLink(c.req.raw, { email: input.email, returnTo: "/app" }); }
      catch (cause) { authProblem(cause, delivery.failure); }
      // Every request gets the same acknowledgement; no member lookup is exposed.
      if (form) return c.redirect(signInCapabilities(config).localOutbox ? "/__dev/outbox" : "/signin?requested=1", 303);
      return c.json({ accepted: true });
    })
    /** The unguessable request key is a status capability, never a sign-in credential. */
    .post("/api/auth/magic/status", async c => {
      const input = await parseBody(c.req, z.object({ email: z.string().email().max(254), requestKey: z.string().min(32).max(160) }).strict());
      const row = await c.env.DB.prepare("SELECT * FROM mail_deliveries WHERE request_digest=?").bind(await requestDigest(c.get("runtimeConfig").sessionSecret, input.email, input.requestKey)).first<MailRow>();
      if (!row) return c.json({ state: "unconfirmed", errorDetail: null, nextAttemptAt: null, canRetry: false });
      const { state, errorDetail, nextAttemptAt, canRetry } = mailStatus(row, new Date().toISOString());
      return c.json({ state, errorDetail, nextAttemptAt, canRetry });
    })
    .on(["GET", "HEAD", "POST"], [...BASE_AUTH_PATHS], async c => {
      const { handle } = await createSlateAuth(c.env.DB, c.get("runtimeConfig"), { waitUntil: promise => c.executionCtx.waitUntil(promise) });
      const response = await handle(c.req.raw);
      // With SSO off no provider owns the callback, and Base answers null for it.
      if (!response) return c.json(error("NOT_FOUND", "Not found."), 404);
      // A used, expired or foreign link submitted from the confirmation page gets the same page, not JSON.
      if (c.req.path === "/auth/confirm" && c.req.method === "POST" && response.status === 400) return retiredLink("POST");
      return response;
    })
    .get("/api/auth/magic/accept", c => retiredLink(c.req.method))
    // WORK-006: the link only shows a confirmation page; its same-origin POST accepts once and
    // the session is issued by the native session store Base's adapters use.
    .get("/api/auth/invitation/accept", async c => {
      const token = invitationToken.safeParse(c.req.query("token"));
      const preview = token.success ? await previewInvitation(c.env.DB, c.get("runtimeConfig"), token.data) : null;
      return invitationPage({ token: token.success ? token.data : "", expiresAt: preview?.expiresAt ?? null, method: c.req.method });
    })
    .post("/api/auth/invitation/accept", async c => {
      const form = await c.req.parseBody();
      const token = invitationToken.safeParse(form.token);
      if (!token.success) return invitationPage({ token: "", expiresAt: null, method: "POST" });
      const config = c.get("runtimeConfig");
      let accepted: { memberId: string };
      try { accepted = await acceptInvitation(c.env.DB, config, token.data, { files: c.env.FILES, jobs: c.env.JOBS }); }
      catch (cause) {
        if (cause instanceof ApiProblem && cause.code === "LINK_INVALID") return invitationPage({ token: "", expiresAt: null, method: "POST" });
        throw cause;
      }
      const store = slateSessions(c.env.DB, config), person = await store.member("id=?", accepted.memberId);
      const completed = person && await store.issue({ person, kind: "native", now: Date.now(), returnTo: "/app", freshProof: true });
      if (!completed) return invitationAcceptedPage("POST");
      c.header("Set-Cookie", completed.cookie);
      return c.redirect(completed.returnTo, 303);
    })
    .post("/api/auth/logout", async c => {
      const { auth } = await createSlateAuth(c.env.DB, c.get("runtimeConfig"));
      try { c.header("Set-Cookie", (await auth.signOut(c.req.raw)).cookie); }
      catch (cause) { authProblem(cause); }
      return c.body(null, 204);
    })
    .get("/api/session", (context) => {
      const member = context.get("member");
      if (!member) return context.json(error("UNAUTHENTICATED", "A valid session is required."), 401);
      return context.json({ member });
    });
}
