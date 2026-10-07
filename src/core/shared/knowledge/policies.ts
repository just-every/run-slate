export const pageLifecyclePolicy = {
  id: "page.lifecycle.v1",
  default: "always-live",
  values: ["always-live", "draft-then-publish"],
} as const;

export const pageAccessPolicy = {
  id: "page.access.v1",
  default: "workspace-general",
  values: ["workspace-general", "container-general"],
} as const;

export const pagePublicAccessPolicy = {
  id: "page.public-access.v1",
  default: "site",
  values: ["site", "link"],
} as const;

export const pageVersionPolicy = {
  id: "page.version.v1",
  default: "autosnapshot",
  values: ["autosnapshot", "labelled"],
} as const;

export const pageStatusPolicy = {
  id: "page.status.v1",
  default: "verification-only",
  values: ["verification-only", "open-vocabulary"],
} as const;

export const recordPageParityPolicy = {
  id: "record.page-parity.v1",
  default: "record-is-page",
  values: ["record-is-page", "record-is-row"],
} as const;

export const automationScopePolicy = {
  id: "automation.scope.v1",
  default: "source",
  values: ["source", "container", "site"],
} as const;

export const containerAccessPolicy = {
  id: "container.access.v1",
  default: "class-led",
  values: ["class-led", "grant-led"],
} as const;

export interface KnowledgePolicyProfile {
  "page.lifecycle.v1": (typeof pageLifecyclePolicy.values)[number];
  "page.access.v1": (typeof pageAccessPolicy.values)[number];
  "page.public-access.v1": (typeof pagePublicAccessPolicy.values)[number];
  "page.version.v1": (typeof pageVersionPolicy.values)[number];
  "page.status.v1": (typeof pageStatusPolicy.values)[number];
  "record.page-parity.v1": (typeof recordPageParityPolicy.values)[number];
  "automation.scope.v1": (typeof automationScopePolicy.values)[number];
  "container.access.v1": (typeof containerAccessPolicy.values)[number];
}

export const defaultKnowledgePolicyProfile: KnowledgePolicyProfile = {
  "page.lifecycle.v1": pageLifecyclePolicy.default,
  "page.access.v1": pageAccessPolicy.default,
  "page.public-access.v1": pagePublicAccessPolicy.default,
  "page.version.v1": pageVersionPolicy.default,
  "page.status.v1": pageStatusPolicy.default,
  "record.page-parity.v1": recordPageParityPolicy.default,
  "automation.scope.v1": automationScopePolicy.default,
  "container.access.v1": containerAccessPolicy.default,
};

export function resolveKnowledgePolicyProfile(overrides: Partial<KnowledgePolicyProfile> = {}): KnowledgePolicyProfile {
  const profile = { ...defaultKnowledgePolicyProfile, ...overrides };
  const definitions = [pageLifecyclePolicy, pageAccessPolicy, pagePublicAccessPolicy, pageVersionPolicy, pageStatusPolicy, recordPageParityPolicy, automationScopePolicy, containerAccessPolicy] as const;
  for (const definition of definitions) {
    const value = profile[definition.id as keyof KnowledgePolicyProfile];
    if (!(definition.values as readonly string[]).includes(value)) {
      throw new Error(`Unsupported value for ${definition.id}: ${String(value)}.`);
    }
  }
  return profile;
}
