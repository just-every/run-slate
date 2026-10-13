import { readSettings } from '@runeditrun/rer/adapter-settings';
import { recoverInterrupted } from '@runeditrun/rer/local/recovery';

export const setupAdvice = 'Run rer setup --owner-email you@example.test before starting local development.';
export const settings = {
  file: '.dev.vars', originKey: 'APP_URL',
  values: ({ input, origin }) => ({ APP_URL: origin, SETUP_OWNER_EMAIL: input.SETUP_OWNER_EMAIL,
    IDENTITY_PROVIDER: identityProviderOrigin(input.IDENTITY_PROVIDER),
    MAIL_PROVIDER: 'development', MAIL_FROM: 'auth@localhost.test', LOCAL_DEVELOPMENT: 'true' }),
};
/** Optional shared identity answer; no callback may choose the provider origin. */
export function identityProviderOrigin(value) {
  const configured = value?.trim() || '';
  if (!configured) return '';
  let url;
  try { url = new URL(configured); } catch {}
  if (!url || url.protocol !== 'https:' || url.origin !== configured || url.username || url.password) throw new Error('IDENTITY_PROVIDER must be an exact HTTPS origin.');
  return configured;
}
export function validateLocalSettings(vars) {
  identityProviderOrigin(vars.IDENTITY_PROVIDER);
  let url;
  try { url = new URL(vars.APP_URL); } catch {}
  if (!url || url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.port || Number(url.port) === 0 || url.origin !== vars.APP_URL
    || vars.LOCAL_DEVELOPMENT !== 'true' || vars.MAIL_PROVIDER !== 'development'
    || !vars.SESSION_SECRET || vars.SESSION_SECRET.length < 32
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vars.SETUP_OWNER_EMAIL ?? '') || !vars.MAIL_FROM) {
    throw new Error('Invalid private local settings. Restore .dev.vars or run rer setup --owner-email owner@example.test.');
  }
  return url;
}
export const settingsFor = (env = process.env) => ({ ...settings, file: env.SLATE_LOCAL_SETTINGS_PATH ?? settings.file });
export async function loadLocalSettings(root, env = process.env) {
  await (await recoverInterrupted(root))?.release();
  const { values, text } = await readSettings(root, settingsFor(env));
  if (text === undefined) throw new Error(setupAdvice);
  validateLocalSettings(values);
  return { ...values };
}
export const localPaths = (env = process.env) => ({
  configPath: env.SLATE_WRANGLER_CONFIG_PATH ?? 'wrangler.jsonc',
  persistPath: env.SLATE_PERSIST_STATE_PATH ?? '.wrangler/state',
});
export function migrationCommand(env = process.env) {
  const { configPath, persistPath } = localPaths(env);
  return ['pnpm', ['exec', 'wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', persistPath, '--config', configPath]];
}
