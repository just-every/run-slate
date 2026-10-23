/** Deployment scope is separate from the eight stored content policies. */
export type LaunchProfile = "core-wiki" | "flagship";
import type {FeatureKey} from '../../features/feature-switches/catalog';

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

/** One map governs API, document navigation and queue admission. Null stays extension-only. */
export function switchForPath(pathname: string): FeatureKey | null {
  const path = decodeURIComponent(pathname);
  if (/^\/app\/runs(?:\/|$)/.test(path)) return 'ask';
  const family = /^\/api\/([^/]+)(?:\/|$)/.exec(path)?.[1];
  const map: Record<string, FeatureKey> = {ai: 'ask', runs: 'ask', suggestions: 'suggestions', skills: 'agents', claims: 'agents', impact: 'agents', connectors: 'connectors', sources: 'connectors', agent: 'mcp'};
  return family ? map[family] ?? null : null;
}

export function switchForJob(job: unknown): FeatureKey | null {
  if (!job || typeof job !== 'object' || !('kind' in job) || typeof job.kind !== 'string') return null;
  if (job.kind.startsWith('federation.')) return 'agents';
  if (['intelligence.run', 'intelligence.finalize'].includes(job.kind)) return 'ask';
  return null;
}
