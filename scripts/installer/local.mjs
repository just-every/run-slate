import { localInstaller } from '@runeditrun/rer/local-installer';
import { developmentTarget, previewTarget } from '@runeditrun/rer/operator-installer';
import { commandAdapter as describeAdapter } from '@runeditrun/rer/adapter';
import { deploy } from './deploy.mjs';
import { settingsFor, migrationCommand, validateLocalSettings } from './settings.mjs';
import { owner, signIn } from './auth.mjs';
import { localOwner } from './owner.mjs';
import { build } from '../build.mjs';
import { portability } from './portability.mjs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const secrets = settingsFor();
secrets.file = relative(root, resolve(root, secrets.file));
// Base's shared production runtime binds the origin to Slate's native APP_URL.
const preview = context => {
  const [command, args, options] = previewTarget({ ...context, runtimePort: context.runtimePort ?? new URL(context.origin).port });
  return [command, args, { ...options, env: { ...options.env, RER_ORIGIN_KEY: 'APP_URL' } }];
};
export const hooks = {
  node: '22.20.0', tools: ['pnpm', 'node'], features: { localTrialWithoutEmail: true }, secrets, build,
  prepare({ input }) {
    if (input.MAIL_PROVIDER !== 'development' || input.MAIL_API_KEY) throw new Error('Local setup requires the development mail outbox without provider credentials. Configure hosted mail through rer deploy.');
  },
  migrate: context => { validateLocalSettings(context.vars); return migrationCommand({ ...process.env, ...(context.demo ? { RER_STATE_DIR: context.demo.state } : {}) }); },
  start: preview, owner, signIn, localOwner,
};
export const lifecycle = localInstaller(hooks);
export const commandAdapter = describeAdapter(lifecycle, {
  dev: developmentTarget, preview, verify: ['pnpm', ['run', 'verify:app']], deploy: deploy(lifecycle), portability,
  publicPages: ['/signin', '/docs', '/docs/install', '/docs/moving-in', '/docs/move-from-notion', '/docs/move-from-confluence', '/docs/trustworthy-handbook', '/docs/backup', '/docs/email-delivery', '/docs/cloudflare-footprint'],
  setup: { manifestFile: 'rer-setup.json' }, product: 'Slate',
  // Local-only persona sign-in; vite.config.ts loads the entry for `vite dev` alone.
  devIdentity: { entry: 'src/dev/server.ts', output: ['dist'], emailLinkTest: 'tests/local-journey/cli.test.mjs' },
  settings: [secrets.file, secrets.file + '.previous'],
  // Hosted setup defaults to a real provider; this computer's setup answers the development outbox itself.
  input: { names: { email: 'SETUP_OWNER_EMAIL' }, defaults: async () => ({ MAIL_PROVIDER: 'development', MAIL_FROM: 'auth@localhost.test' }) },
  // The run site (run-slate.com): `rer build --site` writes src/site/pages.tsx's pages to dist/site; `rer deploy --site` publishes it.
  site: { entry: 'src/site/pages.tsx', output: 'dist/site', declaration: 'deploy-site.json', config: 'vite.site.config.ts' },
});
