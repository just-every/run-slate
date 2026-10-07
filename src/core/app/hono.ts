import { assertRequestOrigin, enforceRateLimit } from "./http-security";
import { ApiProblem } from "./problems";
import { invalidateContentRooms } from "../features/collaboration/invalidation";
import { authenticateExternalAgent } from "../features/external-agent/credentials";
import { ZodError } from "zod";
import { Hono } from "hono";
import { createSessionRoutes, createSessionService } from "../features/session";
import { probeDependencies } from "../platform/health";
import { RuntimeConfigurationError } from "../platform/config/runtime";
import { error } from "../shared/errors";
import { seedLocalAuroraSampleData } from "./local-sample-data";
import { mountFeatures } from "./mount-features";
import { runtimeConfigFor, assertStoredConfiguration } from "./runtime-gate";
import type { AppEnvironment } from "./types";

/**
 * The HTTP families this Worker answers with Hono. `src/server.ts` consults it
 * before TanStack Start, so it must never claim `/_serverFn/`, a React document,
 * or a catch-all.
 */
export function isHonoRequest(pathname: string): boolean {
  return pathname === "/health"
    || pathname === "/api"
    || pathname.startsWith("/api/")
    || pathname === "/p"
    || pathname.startsWith("/p/");
}

/** `/api/` members that answer without a native session. Everything else does not. */
const publicApiPaths = new Set(["/api/auth/capabilities", "/api/auth/local-sign-in", "/api/auth/logout", "/api/auth/magic", "/api/auth/magic/status", "/api/auth/magic/accept", "/api/auth/invitation/accept", "/api/auth/identity", "/api/auth/identity/callback"]);

export function createApi() {
  const app = new Hono<AppEnvironment>()
    .use("*", async (context, next) => {
      context.set("runtimeConfig", runtimeConfigFor(context.env, new URL(context.req.url).hostname));
      if(new URL(context.req.url).pathname!=="/health")await assertStoredConfiguration(context.env);
      assertRequestOrigin(context);
      if(!['GET','HEAD','OPTIONS'].includes(context.req.method)&&context.req.header('content-type')?.includes('application/json')) {
        try { await context.req.json(); } catch { throw new ApiProblem(400,'INVALID_REQUEST','The request must contain valid JSON.'); }
      }
      context.header('X-Content-Type-Options','nosniff');
      context.header('Referrer-Policy','same-origin');
      context.header('Cache-Control','no-store');
      const path=new URL(context.req.url).pathname;
      if(path.startsWith('/api/auth/')) await enforceRateLimit(context,'auth',120);
      else if(path.startsWith('/p/')) await enforceRateLimit(context,'public-page',120);
      await next();
      if(!['GET','HEAD','OPTIONS'].includes(context.req.method)&&context.res.ok&&(path==='/api/auth/logout'||/^\/api\/(sharing|groups|members|workspace)(?:\/|$)/.test(path))) await invalidateContentRooms(context.env);
    })
    // BASE-ACCESS-002: a protected API namespace authenticates before route
    // matching, so an anonymous unknown member keeps the native 401 and only a
    // valid session reaches the Hono 404.
    .use("/api/*", async (context, next) => {
      const service = createSessionService(context.env.DB, context.get("runtimeConfig").sessionSecret);
      let member = await service.authenticate(context.req.raw.headers);
      const pathname=new URL(context.req.url).pathname;
      if(!member&&(pathname==="/api/agent"||pathname.startsWith("/api/agent/")))member=await authenticateExternalAgent(context.env.DB,context.req.raw.headers);
      if (member) { context.set("member", member); await enforceRateLimit(context,`operator:${member.id}`,600); }
      if (!member && !publicApiPaths.has(new URL(context.req.url).pathname)) {
        return context.json(error("UNAUTHENTICATED", "A valid session is required."), 401);
      }
      await next();
    })
    .use('/p/*',async(context,next)=>{const member=await createSessionService(context.env.DB,context.get('runtimeConfig').sessionSecret).authenticate(context.req.raw.headers);if(member)context.set('member',member);await next();})
    .get("/health", async (context) => {
      try {
        await assertStoredConfiguration(context.env);
        await enforceRateLimit(context,'health',120);
        const checks = await probeDependencies({ database: context.env.DB, files: context.env.FILES, jobs: context.env.JOBS });
        return context.json({ status: "ok", checks });
      } catch (cause) {
        if(cause instanceof ApiProblem||cause instanceof RuntimeConfigurationError)throw cause;
        return context.json(error("DEPENDENCY_UNAVAILABLE", "A Slate dependency is unavailable."), 503);
      }
    })
    .route("/", createSessionRoutes({ seedLocalSampleData: seedLocalAuroraSampleData }))
;

  mountFeatures(app);

  app.notFound((context) => context.json(error("NOT_FOUND", "Not found."), 404));

  app.onError((cause, context) => {
    if (cause instanceof ZodError) return context.json(error("INVALID_REQUEST","The request is invalid."),400);
    if (cause instanceof ApiProblem) return context.json({code:cause.code,message:cause.message,...(cause.details===undefined?{}:{details:cause.details})},cause.status);
    if (cause instanceof RuntimeConfigurationError) {
      return context.json(error("CONFIGURATION_INVALID", cause.message), 503);
    }
    console.error("Slate request failed with an internal error.");
    return context.json(error("INTERNAL_ERROR", "Slate could not complete that request."), 500);
  });

  return app;
}

export type AppType = ReturnType<typeof createApi>;
