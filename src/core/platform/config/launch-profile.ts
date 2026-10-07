/** Deployment scope is separate from the eight stored content policies. */
export type LaunchProfile = "core-wiki" | "flagship";

export function readLaunchProfile(value?: string): LaunchProfile {
  const profile = value?.trim() || "core-wiki";
  if (profile !== "core-wiki" && profile !== "flagship") {
    throw new Error('SLATE_PROFILE must be "core-wiki" or "flagship".');
  }
  return profile;
}

const flagshipApiFamilies = [
  "ai", "runs", "inquiries", "experiments", "skills", "effects", "impact",
  "agent", "claims", "sources", "connectors", "suggestions",
];

/** Decode once as the router does, so encoded family names cannot bypass the gate. */
export function isFlagshipPath(pathname: string): boolean {
  const path = decodeURIComponent(pathname);
  return flagshipApiFamilies.some(family => path === `/api/${family}` || path.startsWith(`/api/${family}/`))
    || /^\/api\/decisions\/from-run(?:\/|$)/.test(path)
    || /^\/api\/collaboration\/[^/]+\/socket\/?$/.test(path)
    || /^\/app\/(runs|inquiries)(?:\/|$)/.test(path);
}

export function isFlagshipJob(job: unknown): boolean {
  if (!job || typeof job !== "object" || !("kind" in job)) return false;
  return typeof job.kind === "string" && (job.kind.startsWith("intelligence.") || job.kind.startsWith("federation."));
}
