import { readLaunchProfile, type LaunchProfile } from "./launch-profile";

export interface RuntimeBindings {
  RER_DEMO?: string;
  RER_OWNER_CLAIM_ISSUER?: string;
  RER_OWNER_CLAIM_INSTALLATION_ID?: string;
  RER_OWNER_CLAIM_PUBLIC_KEYS?: string;
  RER_MANAGEMENT_ORIGIN?: string;
  RER_INSTALLATION_ID?: string;
  SLATE_PROFILE?: string;
  APP_URL?: string;
  HAPPYTOHELP_DELEGATION_ORIGIN?: string;
  HAPPYTOHELP_DELEGATION_CLIENT_ID?: string;
  HAPPYTOHELP_DELEGATION_ACCOUNT_ID?: string;
  ORBIT_DELEGATION_ORIGIN?: string;
  ORBIT_DELEGATION_CLIENT_ID?: string;
  ORBIT_DELEGATION_ACCOUNT_ID?: string;
  ALLOW_LOOPBACK_DELEGATION?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  SLACK_CLIENT_ID?: string;
  SLACK_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  SETUP_OWNER_EMAIL?: string;
  SETUP_TOKEN?: string;
  SESSION_SECRET?: string;
  MAIL_PROVIDER?: string;
  MAIL_FROM?: string;
  MAIL_API_KEY?: string;
  PUBLIC_PAGE_HOST?: string;
  LINK_PREVIEWS_ENABLED?: string;
  AI_ENABLED?: string;
  AI_PROVIDER?: string;
  AI_LOCAL_URL?: string;
  AI_LOCAL_TOKEN?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
  SSO_ENABLED?: string;
  IDENTITY_PROVIDER?: string;
  IDENTITY_ISSUER_URL?: string;
  IDENTITY_CLIENT_ID?: string;
  IDENTITY_CLIENT_SECRET?: string;
  IDENTITY_AUTHORIZATION_ENDPOINT?: string;
  IDENTITY_TOKEN_ENDPOINT?: string;
  IDENTITY_JWKS_URI?: string;
  IDENTITY_TRANSACTION_SECRET?: string;
  IDENTITY_TOKEN_AUTH_METHOD?: string;
  CONNECTOR_CREDENTIALS_KEY?: string;
  RER_DEV_KEY?: string;
  RER_DEV_IDENTITY?: string;
  LOCAL_DEVELOPMENT?: string;
}

export interface RuntimeConfig {
  demo?: boolean;
  /** Omitted by narrow adapter callers; deployment reads always resolve this. */
  launchProfile?: LaunchProfile;
  localDevelopment: boolean;
  /** Keys every stored session digest. Required in both modes; never optional. */
  sessionSecret: string;
  appUrl?: string;
  setupOwnerEmail?: string;
  /** One-time token for POST /auth/bootstrap; present only until the deployment claims its owner. */
  setupToken?: string;
  mailProvider?: "resend" | "sendgrid" | "development";
  mailFrom?: string;
  mailApiKey?: string;
  publicPageHost?: string;
  linkPreviewsEnabled?: boolean;
  aiEnabled?: boolean;
  aiProvider?: "openai" | "local-codex";
  aiLocalUrl?: string;
  aiLocalToken?: string;
  aiApiKey?: string;
  aiModel?: string;
  ssoEnabled?: boolean;
  /** The incumbent provider, pinned to exact issuer, client and HTTPS endpoints. */
  identityProvider?: IdentityProviderPin;
  /** Optional shared dependency provider origin; credentials are persisted by the pull link. */
  dependencyProvider?: string;
  connectorCredentialsKey?: string;
}

export interface IdentityProviderPin {
  issuer: string;
  clientId: string;
  clientSecret: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  transactionSecret: string;
  /** How Slate authenticates at the token endpoint; the incumbent default posts the client secret. */
  tokenAuthMethod: 'client_secret_post' | 'client_secret_basic';
}

export class RuntimeConfigurationError extends Error {}

const requiredDeploymentVariables = [
  "APP_URL",
  "SETUP_OWNER_EMAIL",
  "SESSION_SECRET",
  "MAIL_PROVIDER",
  "MAIL_FROM",
  "MAIL_API_KEY",
] as const;
const requiredAiVariables = ["AI_API_KEY", "AI_MODEL"] as const;
const requiredIdentityVariables = ["IDENTITY_ISSUER_URL", "IDENTITY_CLIENT_ID", "IDENTITY_CLIENT_SECRET", "IDENTITY_AUTHORIZATION_ENDPOINT", "IDENTITY_TOKEN_ENDPOINT", "IDENTITY_JWKS_URI", "IDENTITY_TRANSACTION_SECRET"] as const;

function missingDeploymentVariables(env: RuntimeBindings): string[] {
  return requiredDeploymentVariables.filter((name) => !(name === "MAIL_API_KEY" && env.MAIL_PROVIDER === "development") && !env[name]?.trim());
}

function readBoolean(env: RuntimeBindings, name: "AI_ENABLED" | "LINK_PREVIEWS_ENABLED" | "SSO_ENABLED", defaultValue: boolean): boolean {
  const value = env[name]?.trim();
  if (!value) return defaultValue;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new RuntimeConfigurationError(`${name} must be "true" or "false".`);
}

function requireHttpUrl(value: string, name: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
    return url;
  } catch {
    throw new RuntimeConfigurationError(`${name} must be an absolute HTTP(S) URL.`);
  }
}

function readPublicPageHost(env: RuntimeBindings, appUrl: URL): string {
  const configured = env.PUBLIC_PAGE_HOST?.trim();
  if (!configured) return appUrl.host;
  if (/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(configured)) return configured;
  throw new RuntimeConfigurationError("PUBLIC_PAGE_HOST must be a host name with an optional port.");
}

function requireSessionSecret(env: RuntimeBindings): string {
  const secret = env.SESSION_SECRET?.trim();
  if (!secret) throw new RuntimeConfigurationError("Missing required configuration: SESSION_SECRET.");
  return secret;
}

/** Exact origins only: paths, credentials and normalized alternate IP spellings refuse. */
export function isLocalOrigin(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.origin === value && ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
}

export function readRuntimeConfig(env: RuntimeBindings, isLoopback: boolean): RuntimeConfig {
  let launchProfile: LaunchProfile;
  try { launchProfile = readLaunchProfile(env.SLATE_PROFILE); }
  catch (cause) { throw new RuntimeConfigurationError((cause as Error).message); }
  const missing = missingDeploymentVariables(env);
  if (missing.length) throw new RuntimeConfigurationError(`Missing required configuration: ${missing.join(", ")}.`);
  const mailProvider = env.MAIL_PROVIDER!.trim();
  if (!["resend", "sendgrid", "development"].includes(mailProvider)) throw new RuntimeConfigurationError("MAIL_PROVIDER must be resend, sendgrid or development.");
  const appUrl = requireHttpUrl(env.APP_URL!, "APP_URL");
  const localDevelopment = env.LOCAL_DEVELOPMENT === "true";
  if (env.LOCAL_DEVELOPMENT && !["true", "false"].includes(env.LOCAL_DEVELOPMENT)) throw new RuntimeConfigurationError('LOCAL_DEVELOPMENT must be "true" or "false".');
  if (localDevelopment && (!isLoopback || !isLocalOrigin(env.APP_URL))) throw new RuntimeConfigurationError('LOCAL_DEVELOPMENT requires an exact loopback APP_URL origin and a loopback request.');
  if (mailProvider === "development" && !localDevelopment && env.RER_DEMO !== "1") throw new RuntimeConfigurationError('MAIL_PROVIDER development requires LOCAL_DEVELOPMENT and a loopback APP_URL.');
  if (env.AI_PROVIDER === 'local-codex' && !localDevelopment) throw new RuntimeConfigurationError('AI_PROVIDER local-codex is development-only and cannot run on a hosted deployment.');
  if (env.AI_PROVIDER && !['openai', 'local-codex'].includes(env.AI_PROVIDER)) throw new RuntimeConfigurationError('AI_PROVIDER must be openai or local-codex.');
  const aiEnabled = env.RER_DEMO !== "1" && readBoolean(env, "AI_ENABLED", false);
  const ssoEnabled = readBoolean(env, "SSO_ENABLED", false);
  const missingAiVariables = aiEnabled
    ? (env.AI_PROVIDER === 'local-codex' ? ['AI_LOCAL_URL', 'AI_LOCAL_TOKEN', 'AI_MODEL'] as const : requiredAiVariables).filter((name) => !env[name]?.trim())
    : [];
  const missingIdentityVariables = ssoEnabled
    ? requiredIdentityVariables.filter((name) => !env[name]?.trim())
    : [];
  const conditionalMissing = [...missingAiVariables, ...missingIdentityVariables];
  if (conditionalMissing.length) {
    throw new RuntimeConfigurationError(`Missing required configuration: ${conditionalMissing.join(", ")}.`);
  }

  const dependencyProvider = env.IDENTITY_PROVIDER?.trim() || undefined;
  if (dependencyProvider) {
    const provider = requireHttpUrl(dependencyProvider, 'IDENTITY_PROVIDER');
    if (provider.protocol !== 'https:' || provider.origin !== dependencyProvider || provider.username || provider.password) throw new RuntimeConfigurationError('IDENTITY_PROVIDER must be an exact HTTPS origin.');
  }
  const tokenAuthMethod = env.IDENTITY_TOKEN_AUTH_METHOD?.trim() || 'client_secret_post';
  if (tokenAuthMethod !== 'client_secret_post' && tokenAuthMethod !== 'client_secret_basic') throw new RuntimeConfigurationError('IDENTITY_TOKEN_AUTH_METHOD must be client_secret_post or client_secret_basic.');
  if (ssoEnabled && env.IDENTITY_TRANSACTION_SECRET!.trim().length < 32) throw new RuntimeConfigurationError("IDENTITY_TRANSACTION_SECRET must contain at least 32 characters.");
  if (ssoEnabled && env.IDENTITY_TRANSACTION_SECRET!.trim() === env.SESSION_SECRET?.trim()) throw new RuntimeConfigurationError("IDENTITY_TRANSACTION_SECRET must differ from SESSION_SECRET.");
  if (aiEnabled && env.AI_PROVIDER === "local-codex" && !isLocalOrigin(env.AI_LOCAL_URL)) throw new RuntimeConfigurationError("AI_LOCAL_URL must use an exact loopback origin.");

  return {
    launchProfile,
    demo: env.RER_DEMO === "1",
    localDevelopment,
    sessionSecret: requireSessionSecret(env),
    appUrl: localDevelopment ? env.APP_URL : appUrl.toString(),
    setupOwnerEmail: env.SETUP_OWNER_EMAIL,
    setupToken: env.SETUP_TOKEN?.trim() || undefined,
    mailProvider: mailProvider as RuntimeConfig["mailProvider"],
    mailFrom: env.MAIL_FROM,
    mailApiKey: env.MAIL_API_KEY,
    publicPageHost: readPublicPageHost(env, appUrl),
    linkPreviewsEnabled: readBoolean(env, "LINK_PREVIEWS_ENABLED", true),
    aiEnabled,
    aiProvider: env.AI_PROVIDER === "local-codex" ? "local-codex" : "openai",
    aiLocalUrl: env.AI_LOCAL_URL,
    aiLocalToken: env.AI_LOCAL_TOKEN,
    aiApiKey: env.AI_API_KEY,
    aiModel: env.AI_MODEL,
    ssoEnabled,
    dependencyProvider,
    identityProvider: ssoEnabled ? {
      issuer: env.IDENTITY_ISSUER_URL!.trim(),
      clientId: env.IDENTITY_CLIENT_ID!.trim(),
      clientSecret: env.IDENTITY_CLIENT_SECRET!.trim(),
      authorizationEndpoint: env.IDENTITY_AUTHORIZATION_ENDPOINT!.trim(),
      tokenEndpoint: env.IDENTITY_TOKEN_ENDPOINT!.trim(),
      jwksUri: env.IDENTITY_JWKS_URI!.trim(),
      transactionSecret: env.IDENTITY_TRANSACTION_SECRET!.trim(),
      tokenAuthMethod,
    } : undefined,
    connectorCredentialsKey: env.CONNECTOR_CREDENTIALS_KEY,
  };
}
