import { fileURLToPath } from 'node:url';
import { checkOperationCommands } from './check-operation-commands.mjs';

// Validate declared deploy-kit inputs locally; never contact providers or print values.
export function validateConfiguration(env) {
  checkOperationCommands(fileURLToPath(new URL('../', import.meta.url)));
  const required = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'SLATE_SETUP_OWNER_EMAIL', 'SLATE_MAIL_PROVIDER', 'SLATE_MAIL_FROM', 'SLATE_SESSION_SECRET', 'SLATE_MAIL_API_KEY'];
  const missing = required.filter(name => !env[name]?.trim());
  if (missing.length) throw new Error(`Missing deployment inputs: ${missing.join(', ')}.`);
  if (!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID)) throw new Error('Invalid CLOUDFLARE_ACCOUNT_ID.');
  if (!['resend', 'sendgrid'].includes(env.SLATE_MAIL_PROVIDER)) throw new Error('Invalid SLATE_MAIL_PROVIDER.');
  for (const name of ['SLATE_SETUP_OWNER_EMAIL', 'SLATE_MAIL_FROM']) {
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(env[name])) throw new Error(`Invalid ${name}.`);
  }
  if (env.SLATE_SESSION_SECRET.trim().length < 32) throw new Error('Invalid SLATE_SESSION_SECRET.');
}
