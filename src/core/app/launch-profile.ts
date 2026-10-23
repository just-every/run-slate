import type { Hono } from "hono";
import type { AppEnvironment } from "./types";
import { isFlagshipPath } from "../platform/config/launch-profile";
import {pathEnabled} from '../features/feature-switches/gate';
import {featureAvailability} from '../features/feature-switches/state';

/** Registered after native authentication, before every feature router. */
export function mountLaunchProfile(app: Hono<AppEnvironment>) {
  app.use("/api/*", async (context, next) => {
    if (isFlagshipPath(new URL(context.req.url).pathname) && !await pathEnabled(context.env, context.get('member')!.workspaceId, new URL(context.req.url).pathname)) {
      return context.json({ code: "FEATURE_DISABLED", message: "This feature is unavailable in the core-wiki profile." }, 403);
    }
    await next();
  });
  app.get("/api/profile", async context => context.json({ profile: context.get("runtimeConfig").launchProfile, features: await featureAvailability(context.env.DB, context.get('member')!.workspaceId, context.env) }));
}
