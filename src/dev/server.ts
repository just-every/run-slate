// Local dev identity. LOCAL-ONLY: vite.config.ts loads this entry for `vite dev`
// alone; the deployed main (src/server.ts) never imports it, and `rer build`
// refuses output that contains this layer's marker.
import worker, { ContentCollaboration } from "../server";
import { devGate, devNotFound } from "../../modules/operator-auth/index.mjs";
import { registerDevAdmission } from "../../modules/operator-auth/dev-admission.mjs";
import { decorateLabel } from "../../modules/demo/label.mjs";
import { isLoopbackHostname } from "../core/platform/auth/paths";
import { clearSessionCookie } from "../core/platform/auth/cookie";
import { readRuntimeConfig } from "../core/platform/config/runtime";
import { slateSessions } from "../core/features/session/auth";
import { TENANT } from "../core/features/session/native/store";
import { safeAppPath } from "../core/platform/auth/paths";
import { createUlid } from "../core/shared/ulid";
import type { AppBindings } from "../core/app/types";

export const DEV_LAYER_MARKER = "rer-dev-layer:local-only-never-deploy";
export { ContentCollaboration };
const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow", "x-rer-dev-layer": DEV_LAYER_MARKER };
const text = (status: number, body: string) => new Response(body, { status, headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });

/** Real members at `<as>@dev.localhost`, created only here. Export restores every non-owner member inactive. */
const PERSONAS = [
  { as: "editor", kind: "member", displayName: "Dev editor" },
  { as: "guest", kind: "guest", displayName: "Dev guest" },
] as const;

function managedInstallation(env: AppBindings) {
  if (!env.RER_INSTALLATION_ID || !env.RER_MANAGEMENT_ORIGIN) return false;
  try { return !isLoopbackHostname(new URL(env.RER_MANAGEMENT_ORIGIN).hostname); } catch { return true; }
}

function identity(env: AppBindings) {
  const config = readRuntimeConfig(env, true), store = slateSessions(env.DB, config);
  const everyone = () => [{ as: "owner", email: config.setupOwnerEmail!.toLowerCase() }, ...PERSONAS.map(p => ({ as: p.as, email: `${p.as}@dev.localhost`, role: p.kind }))];
  return {
    store, everyone,
    list: () => [...everyone(), { as: "signed-out" }],

  };
}

async function enter(request: Request, env: AppBindings, gate: NonNullable<ReturnType<typeof devGate>>) {
  if (request.method !== "GET") return text(405, "Method not allowed");
  const url = new URL(request.url), as = url.searchParams.get("as") ?? "owner", reply = new Headers(headers);
  // A harness presenting the key header also receives the browser cookie.
  if (!(request.headers.get("cookie") ?? "").includes(`${gate.cookieName}=`)) reply.append("set-cookie", await gate.setCookie());
  const { store, everyone } = identity(env), now = Date.now();
  if (as === "signed-out") {
    await store.revokeToken(request, now);
    reply.append("set-cookie", clearSessionCookie());
    reply.set("location", "/");
    return new Response(null, { status: 303, headers: reply });
  }
  const persona = everyone().find(entry => entry.as === as);
  if (!persona) return devNotFound();
  const declared = PERSONAS.find(entry => entry.as === as);
  if (declared) {
    const at = new Date(now).toISOString();
    await env.DB.prepare(`INSERT INTO members (id,workspace_id,email,display_name,initials,role,member_kind,status,is_setup_owner,created_at,updated_at)
      SELECT ?,${TENANT},?,?,?,'member',?,'active',0,?,? WHERE ${TENANT} IS NOT NULL ON CONFLICT(workspace_id,email) DO NOTHING`)
      .bind(createUlid(), persona.email, declared.displayName, "D" + declared.as[0]!.toUpperCase(), declared.kind, at, at).run();
  }
  const person = await store.member("lower(email)=?", persona.email);
  if (!person) return text(409, "The owner that rer setup claimed is not in this database. Run rer setup.");
  if (person.status !== "active") return text(403, `${as} is not an active member of this workspace.`);
  const existing = await store.read(request, now);
  if (existing?.kind !== "dev" || existing.operatorId !== person.id) {
    const issued = await store.issue({ person, kind: "dev", now });
    if (!issued) return text(409, "The member changed while signing in. Try again.");
    reply.append("set-cookie", issued.cookie);
  }
  reply.set("location", safeAppPath(url.searchParams.get("returnTo")));
  return new Response(null, { status: 303, headers: reply });
}

export default {
  ...worker,
  async fetch(request, env: AppBindings, execution): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (managedInstallation(env)) {
      // Never admit a dev credential beside a managed installation.
      registerDevAdmission(null);
      if (env.RER_DEV_IDENTITY !== "off") return text(503, "Dev identity refuses to run beside RER_INSTALLATION_ID with a non-loopback RER_MANAGEMENT_ORIGIN. Remove those bindings from local settings or use rer dev --login.");
      return path === "/auth/dev/enter" || path === "/__dev/personas" ? devNotFound() : worker.fetch(request, env, execution);
    }
    const gate = devGate({ key: env.RER_DEV_KEY, origin: env.APP_URL!, local: env.LOCAL_DEVELOPMENT === "true" });
    registerDevAdmission(gate ? (r: Request) => gate.admitsSession(r) : null);
    if (path === "/auth/dev/enter" || path === "/__dev/personas") {
      if (!gate || env.RER_DEV_IDENTITY === "off" || !await gate.admits(request)) return devNotFound();
      return path === "/__dev/personas" ? Response.json(identity(env).list(), { headers }) : enter(request, env, gate);
    }
    if (path === "/__dev/key") return gate ? (await gate.exchange(request) ?? devNotFound()) : devNotFound();
    const response = await worker.fetch(request, env, execution);
    return env.RER_DEMO === '1' ? response : decorateLabel(response, 'Dev');
  },
} satisfies ExportedHandler<AppBindings>;
