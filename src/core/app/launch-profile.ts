import type { Hono } from "hono";
import type { AppEnvironment } from "./types";
import { isFlagshipPath } from "../platform/config/launch-profile";

/** Registered after native authentication, before every feature router. */
export function mountLaunchProfile(app: Hono<AppEnvironment>) {
  app.use("/api/*", async (context, next) => {
    if (context.get("runtimeConfig").launchProfile !== "flagship" && isFlagshipPath(new URL(context.req.url).pathname)) {
      return context.json({ code: "FEATURE_DISABLED", message: "This feature is unavailable in the core-wiki profile." }, 403);
    }
    await next();
  });
  app.get("/api/profile", context => context.json({ profile: context.get("runtimeConfig").launchProfile }));
}
