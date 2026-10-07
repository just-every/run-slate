import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const configPath = process.env.SLATE_WRANGLER_CONFIG_PATH
  ?? (existsSync("wrangler.toml") ? "wrangler.toml" : "deploy/wrangler.local.toml");
const localSampleData = process.env.SLATE_LOCAL_SAMPLE_DATA === "true";
const persistPath = process.env.SLATE_PERSIST_STATE_PATH ?? ".wrangler/state";

// A session digest is keyed by SESSION_SECRET in every mode, so the local
// development binding needs one too. It is generated per dev process and never
// written anywhere: local sessions last as long as the dev server, and no
// secret is committed. Set SLATE_SESSION_SECRET to keep sessions across restarts.
const localServerVariables=Object.fromEntries(['APP_URL','HAPPYTOHELP_DELEGATION_ORIGIN','HAPPYTOHELP_DELEGATION_CLIENT_ID','HAPPYTOHELP_DELEGATION_ACCOUNT_ID','ORBIT_DELEGATION_ORIGIN','ORBIT_DELEGATION_CLIENT_ID','ORBIT_DELEGATION_ACCOUNT_ID','ALLOW_LOOPBACK_DELEGATION','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','SLACK_CLIENT_ID','SLACK_CLIENT_SECRET','GITHUB_CLIENT_ID','GITHUB_CLIENT_SECRET','AI_ENABLED','AI_PROVIDER','AI_API_KEY','AI_MODEL','AI_LOCAL_URL','AI_LOCAL_TOKEN','CONNECTOR_CREDENTIALS_KEY'].flatMap(name=>{const value=process.env[`SLATE_${name}`];return value?[[name,value]]:[]}));
const localSessionSecret = process.env.SLATE_SESSION_SECRET ?? randomUUID();

export default defineConfig({
  plugins: [
    cloudflare({
      inspectorPort: process.env.SLATE_INSPECTOR_PORT ? Number(process.env.SLATE_INSPECTOR_PORT) : false,
      viteEnvironment: { name: "ssr" },
      configPath,
      persistState: { path: persistPath },
      config: localSampleData
        ? { vars: { LOCAL_SAMPLE_DATA: "true", SESSION_SECRET: localSessionSecret, ...localServerVariables, ...(process.env.SLATE_PROFILE ? { SLATE_PROFILE: process.env.SLATE_PROFILE } : {}) } }
        : undefined,
    }),
    // Prerendering is configured and off. This seed has no deployment-invariant
    // document: `/` renders the buyer's owner identity, `/signin` reports the
    // deployment's configured capabilities, and `/app` is a session surface.
    // Discovery and crawling stay off so a link can never pull one in.
    tanstackStart({
      prerender: {
        enabled: false,
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
        failOnError: true,
      },
    }),
    react(),
    tailwindcss(),
  ],
});
