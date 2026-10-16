import { demoSockets } from "./modules/demo/vite.mjs";
import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { loadLocalSettings, localPaths } from "./scripts/installer/settings.mjs";
import { archiveOutputGuard } from "@runeditrun/rer/archive-output";
import { docsSite } from "./src/core/features/docs/build/plugin.ts";

export default defineConfig(async ({ command }) => {
  const paths = localPaths();
  const configPath = command === 'build' && !process.env.SLATE_WRANGLER_CONFIG_PATH && existsSync('wrangler.toml') ? 'wrangler.toml' : paths.configPath;
  const persistPath = process.env.RER_STATE_DIR ?? paths.persistPath;
  const persistWatchRoot = resolve(persistPath);
  // Settings are required to serve, not to resolve this config: rer's export-path
  // guard reads the served folders even right after `rer reset`.
  let missingSettings: unknown;
  const local = command === 'serve' ? await loadLocalSettings(process.cwd()).catch(error => { missingSettings = error; return undefined; }) : undefined;
  if (local && process.env.RER_DEV_ORIGIN) local.APP_URL = process.env.RER_DEV_ORIGIN;
  // Only `vite dev` receives the checkout's dev key and loads the local-only dev identity entry.
  if (local && process.env.RER_DEV_KEY) Object.assign(local, { RER_DEV_KEY: process.env.RER_DEV_KEY, RER_DEV_IDENTITY: process.env.RER_DEV_IDENTITY ?? 'on' });
  const optionalBindings = ['RER_MANAGEMENT_ORIGIN','RER_INSTALLATION_ID','HAPPYTOHELP_DELEGATION_ORIGIN','HAPPYTOHELP_DELEGATION_CLIENT_ID','HAPPYTOHELP_DELEGATION_ACCOUNT_ID','ORBIT_DELEGATION_ORIGIN','ORBIT_DELEGATION_CLIENT_ID','ORBIT_DELEGATION_ACCOUNT_ID','ALLOW_LOOPBACK_DELEGATION','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','SLACK_CLIENT_ID','SLACK_CLIENT_SECRET','GITHUB_CLIENT_ID','GITHUB_CLIENT_SECRET','AI_ENABLED','AI_PROVIDER','AI_API_KEY','AI_MODEL','AI_LOCAL_URL','AI_LOCAL_TOKEN','CONNECTOR_CREDENTIALS_KEY','SLATE_PROFILE'];
  const extra = Object.fromEntries(optionalBindings.flatMap(name => {
    const value = process.env[name === 'SLATE_PROFILE' ? name : `SLATE_${name}`];
    return value ? [[name, value]] : [];
  }));
  return {
  environments: { client: { build: { rolldownOptions: { preserveEntrySignatures: false as const, output: { strictExecutionOrder: true, codeSplitting: { groups: [
    // The main workspace's static graphs arrive in one download. Closed
    // dialogs and specialist routes retain their dynamic boundaries.
    { name:'workspace',test:(id:string)=>
      id.includes('/node_modules/') && /\/(?:@radix-ui\/|@tanstack\/|(?:react|react-dom|scheduler|lucide-react|use-sync-external-store|seroval|clsx|class-variance-authority|tailwind-merge)\/)/.test(id)
      || /\/src\/(?:ext\/index\.client|routes\/(?:__root|app(?:\.(?:index|search|pages\.\$pageId|containers(?:\.index)?|templates\.index|inbox|review|archive|settings))?)\.tsx(?:$|\?)|core\/(?:app\/ui\/(?!SetupShell|FirstRunShell|TreeMoveDialog)|client\/(?:useResource|transport|InitialResources)\.))/.test(id),includeDependenciesRecursively:true },
  ] } } } } } },
  server: { watch: {
    // Native R2/D1 writes are runtime state, and must not reload an active import.
    ignored: (path: string) => {
      const fromState = relative(persistWatchRoot, resolve(path));
      return fromState === '' || (!isAbsolute(fromState) && fromState !== '..' && !fromState.startsWith(`..${sep}`));
    },
  }, fs: {
    // The Worker runner also loads copied modules and the public seed descriptor.
    strict: true,
    allow: ["src", "modules", "seed.json", "public", "node_modules"],
    deny: ["**/.rer/**", "**/.seed/**", "**/exports/**", "**/*.rer", "**/.env*", "**/.dev.vars*", "**/.git/**"],
  } },
  plugins: [
    demoSockets(),
    ...(missingSettings ? [{ name: 'slate-local-settings', configureServer() { throw missingSettings; } }] : []),
    cloudflare({
      inspectorPort: process.env.SLATE_INSPECTOR_PORT ? Number(process.env.SLATE_INSPECTOR_PORT) : false,
      viteEnvironment: { name: "ssr" },
      configPath,
      persistState: { path: persistPath },
      config: local ? { main: 'src/dev/server.ts', vars: { ...local, ...extra, ...(process.env.RER_DEMO === "1" ? { RER_DEMO: "1", RER_DEMO_EXPIRES: process.env.RER_DEMO_EXPIRES ?? "", SLATE_PROFILE: "flagship", AI_ENABLED: "false", AI_API_KEY: "", AI_LOCAL_URL: "", AI_LOCAL_TOKEN: "" } : {}) } } : undefined,
    }),
    // /docs: the repository's Markdown rendered when Vite loads it (DOCS-001), never in the Worker or the browser.
    docsSite(),
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
    // A build whose output holds an installation archive (copied from public/ or emitted) is refused.
    archiveOutputGuard(),
  ],
  };
});
