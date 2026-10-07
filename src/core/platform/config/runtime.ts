import { readLaunchProfile, type LaunchProfile } from "./launch-profile";

export interface RuntimeBindings {
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
  IDENTITY_ISSUER_URL?: string;
  IDENTITY_CLIENT_ID?: string;
  IDENTITY_CLIENT_SECRET?: string;
  CONNECTOR_CREDENTIALS_KEY?: string;
  LOCAL_SAMPLE_DATA?: string;
}

export interface RuntimeConfig {
  /** Omitted by narrow adapter callers; deployment reads always resolve this. */
  launchProfile?: LaunchProfile;
  localSampleData: boolean;
  /** Keys every stored session digest. Required in both modes; never optional. */
  sessionSecret: string;
  appUrl?: string;
  setupOwnerEmail?: string;
  mailProvider?: "resend" | "sendgrid";
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
  identityIssuerUrl?: string;
  identityClientId?: string;
  identityClientSecret?: string;
  connectorCredentialsKey?: string;
}

export class RuntimeConfigurationError extends Error {}

const requiredDeploymentVariables = [
  "APP_URL",
  "SETUP_OWNER_EMAIL",
  "SESSION_SECRET",
  "MAIL_FROM",
  "MAIL_API_KEY",
] as const;
const requiredAiVariables = ["AI_API_KEY", "AI_MODEL"] as const;
const requiredIdentityVariables = ["IDENTITY_ISSUER_URL", "IDENTITY_CLIENT_ID", "IDENTITY_CLIENT_SECRET"] as const;

function missingDeploymentVariables(env: RuntimeBindings): string[] {
  return requiredDeploymentVariables.filter((name) => !env[name]?.trim());
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

export function readRuntimeConfig(env: RuntimeBindings, isLoopback: boolean): RuntimeConfig {
  let launchProfile: LaunchProfile;
  try { launchProfile = readLaunchProfile(env.SLATE_PROFILE); }
  catch (cause) { throw new RuntimeConfigurationError((cause as Error).message); }
  const mailProvider = env.MAIL_PROVIDER?.trim() || "resend";
  if (mailProvider !== "resend" && mailProvider !== "sendgrid") throw new RuntimeConfigurationError("MAIL_PROVIDER must be resend or sendgrid.");
  const localSampleData = env.LOCAL_SAMPLE_DATA === "true" && isLoopback;
  // The local sample binding still needs a session secret: it opens a real D1
  // session, and a session digest is keyed by that secret in every mode.
  if (localSampleData) {
    const aiEnabled=readBoolean(env,'AI_ENABLED',false);
    const aiProvider=env.AI_PROVIDER??'openai';
    if(aiProvider!=='openai'&&aiProvider!=='local-codex')throw new RuntimeConfigurationError('AI_PROVIDER must be openai or local-codex.');
    if(aiEnabled){const required=aiProvider==='local-codex'?['AI_LOCAL_URL','AI_LOCAL_TOKEN','AI_MODEL'] as const:['AI_API_KEY','AI_MODEL'] as const;const missing=required.filter(k=>!env[k]?.trim());if(missing.length)throw new RuntimeConfigurationError(`Missing required configuration: ${missing.join(', ')}.`);}
    if(aiProvider==='local-codex'&&aiEnabled){const url=requireHttpUrl(env.AI_LOCAL_URL!,'AI_LOCAL_URL');if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new RuntimeConfigurationError('AI_LOCAL_URL must use loopback.');}
    return {launchProfile,localSampleData:true,sessionSecret:requireSessionSecret(env),aiEnabled,aiProvider,aiApiKey:env.AI_API_KEY,aiModel:env.AI_MODEL,aiLocalUrl:env.AI_LOCAL_URL,aiLocalToken:env.AI_LOCAL_TOKEN,connectorCredentialsKey:env.CONNECTOR_CREDENTIALS_KEY};
  }
  if(env.AI_PROVIDER==='local-codex')throw new RuntimeConfigurationError('AI_PROVIDER local-codex is development-only and cannot run on a hosted deployment.');
  if(env.AI_PROVIDER && env.AI_PROVIDER!=='openai')throw new RuntimeConfigurationError('AI_PROVIDER must be openai.');

  const missing = missingDeploymentVariables(env);
  if (missing.length) {
    throw new RuntimeConfigurationError(`Missing required configuration: ${missing.join(", ")}.`);
  }

  const appUrl = requireHttpUrl(env.APP_URL!, "APP_URL");
  const aiEnabled = readBoolean(env, "AI_ENABLED", false);
  const ssoEnabled = readBoolean(env, "SSO_ENABLED", false);
  const missingAiVariables = aiEnabled
    ? requiredAiVariables.filter((name) => !env[name]?.trim())
    : [];
  const missingIdentityVariables = ssoEnabled
    ? requiredIdentityVariables.filter((name) => !env[name]?.trim())
    : [];
  const conditionalMissing = [...missingAiVariables, ...missingIdentityVariables];
  if (conditionalMissing.length) {
    throw new RuntimeConfigurationError(`Missing required configuration: ${conditionalMissing.join(", ")}.`);
  }

  return {
    launchProfile,
    localSampleData: false,
    sessionSecret: requireSessionSecret(env),
    appUrl: appUrl.toString(),
    setupOwnerEmail: env.SETUP_OWNER_EMAIL,
    mailProvider,
    mailFrom: env.MAIL_FROM,
    mailApiKey: env.MAIL_API_KEY,
    publicPageHost: readPublicPageHost(env, appUrl),
    linkPreviewsEnabled: readBoolean(env, "LINK_PREVIEWS_ENABLED", true),
    aiEnabled,
    aiProvider: "openai",
    aiApiKey: env.AI_API_KEY,
    aiModel: env.AI_MODEL,
    ssoEnabled,
    identityIssuerUrl: env.IDENTITY_ISSUER_URL,
    identityClientId: env.IDENTITY_CLIENT_ID,
    identityClientSecret: env.IDENTITY_CLIENT_SECRET,
    connectorCredentialsKey: env.CONNECTOR_CREDENTIALS_KEY,
  };
}
