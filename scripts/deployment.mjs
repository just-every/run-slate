import path from "node:path";

export function deploymentNames(environment, resourcePrefix = "slate") {
  if (!/^[a-z0-9][a-z0-9-]{0,30}$/.test(environment)) {
    throw new Error("SLATE_DEPLOY_ENV must use lower-case letters, digits, and hyphens.");
  }
  if (!/^[a-z][a-z0-9-]{0,24}[a-z0-9]$/.test(resourcePrefix)) throw new Error("SLATE_RESOURCE_PREFIX must be 2–26 lower-case letters, digits, or hyphens, starting with a letter and ending with a letter or digit.");
  const prefix = `${resourcePrefix}-${environment}`;
  if (prefix.length > 57) throw new Error("SLATE_RESOURCE_PREFIX and SLATE_DEPLOY_ENV together exceed the resource name limit.");
  return {
    environment,
    worker: prefix,
    database: `${prefix}-db`,
    files: `${prefix}-files`,
    jobs: `${prefix}-jobs`,
  };
}

export function deploymentCachePath(root, environment) {
  return path.join(root, ".seed", "deployment", `${environment}.json`);
}

function required(value, name) {
  if (!value?.trim()) throw new Error(`Missing required setup input: ${name}.`);
  return value.trim();
}

function booleanInput(value, name, defaultValue) {
  const normalized = value?.trim();
  if (!normalized) return defaultValue;
  if (normalized === "true" || normalized === "false") return normalized;
  throw new Error(`${name} must be "true" or "false".`);
}

function hostFromUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocol");
    return url.host;
  } catch {
    throw new Error("SLATE_APP_URL must be an absolute HTTP(S) URL.");
  }
}

function optional(value) {
  return value?.trim() ?? "";
}

export function readDeploymentInput(environment) {
  if(environment.SLATE_AI_PROVIDER && environment.SLATE_AI_PROVIDER!=="openai") throw new Error("Hosted setup supports SLATE_AI_PROVIDER=openai; local-codex is development-only.");
  if(environment.SLATE_ALLOW_LOOPBACK_DELEGATION === "true") throw new Error("Loopback delegation is local-only; hosted native origins require HTTPS.");
  const nativeDelegation = {};
  for (const provider of ["HAPPYTOHELP", "ORBIT"]) {
    const prefix = provider + "_DELEGATION_";
    const origin = optional(environment["SLATE_" + prefix + "ORIGIN"]);
    const clientId = optional(environment["SLATE_" + prefix + "CLIENT_ID"]);
    const accountId = optional(environment["SLATE_" + prefix + "ACCOUNT_ID"]);
    if (origin || clientId || accountId) {
      if (!origin || !clientId || !accountId) throw new Error(`Configure all SLATE_${prefix}ORIGIN, CLIENT_ID and ACCOUNT_ID values.`);
      const url = new URL(origin);
      if(url.protocol!=="https:" || url.username || url.password || url.pathname!=="/" || url.search || url.hash || ["localhost","127.0.0.1","[::1]"].includes(url.hostname)) throw new Error(`SLATE_${prefix}ORIGIN must be an exact hosted HTTPS origin.`);
    }
    nativeDelegation[prefix+"ORIGIN"] = origin;
    nativeDelegation[prefix+"CLIENT_ID"] = clientId;
    nativeDelegation[prefix+"ACCOUNT_ID"] = accountId;
  }
  const launchProfile = optional(environment.SLATE_PROFILE) || 'core-wiki';
  if (!['core-wiki', 'flagship'].includes(launchProfile)) throw new Error('SLATE_PROFILE must be core-wiki or flagship.');
  const names = deploymentNames(environment.SLATE_DEPLOY_ENV, environment.SLATE_RESOURCE_PREFIX);
  const mailProvider = environment.SLATE_MAIL_PROVIDER?.trim() || "resend";
  if (!["resend", "sendgrid"].includes(mailProvider)) throw new Error("SLATE_MAIL_PROVIDER must be resend or sendgrid.");
  const appUrl = required(environment.SLATE_APP_URL, "SLATE_APP_URL");
  const aiEnabled = booleanInput(environment.SLATE_AI_ENABLED, "SLATE_AI_ENABLED", "false");
  const ssoEnabled = booleanInput(environment.SLATE_SSO_ENABLED, "SLATE_SSO_ENABLED", "false");
  const identityIssuerUrl = optional(environment.SLATE_IDENTITY_ISSUER_URL);
  const identityClientId = optional(environment.SLATE_IDENTITY_CLIENT_ID);
  const input = {
    ...names,
    launchProfile,
    nativeDelegation,
    appUrl,
    setupOwnerEmail: required(environment.SLATE_SETUP_OWNER_EMAIL, "SLATE_SETUP_OWNER_EMAIL"),
    mailProvider,
    mailFrom: required(environment.SLATE_MAIL_FROM, "SLATE_MAIL_FROM"),
    publicPageHost: optional(environment.SLATE_PUBLIC_PAGE_HOST) || hostFromUrl(appUrl),
    linkPreviewsEnabled: booleanInput(environment.SLATE_LINK_PREVIEWS_ENABLED, "SLATE_LINK_PREVIEWS_ENABLED", "true"),
    aiEnabled,
    aiModel: aiEnabled === "true" ? required(environment.SLATE_AI_MODEL, "SLATE_AI_MODEL") : optional(environment.SLATE_AI_MODEL),
    googleClientId: optional(environment.SLATE_GOOGLE_CLIENT_ID),
    slackClientId: optional(environment.SLATE_SLACK_CLIENT_ID),
    githubClientId: optional(environment.SLATE_GITHUB_CLIENT_ID),
    ssoEnabled,
    identityIssuerUrl: ssoEnabled === "true" ? required(identityIssuerUrl, "SLATE_IDENTITY_ISSUER_URL") : identityIssuerUrl,
    identityClientId: ssoEnabled === "true" ? required(identityClientId, "SLATE_IDENTITY_CLIENT_ID") : identityClientId,
  };
  return input;
}

export function renderWranglerConfig(template, input, databaseId) {
  const values = {
    HAPPYTOHELP_DELEGATION_ORIGIN: input.nativeDelegation?.HAPPYTOHELP_DELEGATION_ORIGIN ?? "",
    HAPPYTOHELP_DELEGATION_CLIENT_ID: input.nativeDelegation?.HAPPYTOHELP_DELEGATION_CLIENT_ID ?? "",
    HAPPYTOHELP_DELEGATION_ACCOUNT_ID: input.nativeDelegation?.HAPPYTOHELP_DELEGATION_ACCOUNT_ID ?? "",
    ORBIT_DELEGATION_ORIGIN: input.nativeDelegation?.ORBIT_DELEGATION_ORIGIN ?? "",
    ORBIT_DELEGATION_CLIENT_ID: input.nativeDelegation?.ORBIT_DELEGATION_CLIENT_ID ?? "",
    ORBIT_DELEGATION_ACCOUNT_ID: input.nativeDelegation?.ORBIT_DELEGATION_ACCOUNT_ID ?? "",
    WORKER_NAME: input.worker,
    SLATE_PROFILE: input.launchProfile,
    APP_URL: input.appUrl,
    SETUP_OWNER_EMAIL: input.setupOwnerEmail,
    MAIL_FROM: input.mailFrom,
    MAIL_PROVIDER: input.mailProvider ?? "resend",
    PUBLIC_PAGE_HOST: input.publicPageHost,
    LINK_PREVIEWS_ENABLED: input.linkPreviewsEnabled,
    AI_ENABLED: input.aiEnabled,
    AI_MODEL: input.aiModel,
    GOOGLE_CLIENT_ID: input.googleClientId,
    SLACK_CLIENT_ID: input.slackClientId,
    GITHUB_CLIENT_ID: input.githubClientId,
    SSO_ENABLED: input.ssoEnabled,
    IDENTITY_ISSUER_URL: input.identityIssuerUrl,
    IDENTITY_CLIENT_ID: input.identityClientId,
    DATABASE_NAME: input.database,
    DATABASE_ID: databaseId,
    FILES_BUCKET: input.files,
    JOBS_QUEUE: input.jobs,
  };
  const rendered = template.replace(/__([A-Z_]+)__/g, (placeholder, key) => {
    if (!(key in values)) throw new Error(`Unknown Wrangler template placeholder: ${placeholder}.`);
    return String(values[key]).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  });
  if (/__[A-Z_]+__/.test(rendered)) throw new Error("Generated Wrangler config has unresolved placeholders.");
  return rendered;
}
