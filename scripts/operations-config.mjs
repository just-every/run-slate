import { readDeploymentInput } from './deployment.mjs';

// Pure local validation. Never authenticates, provisions or prints input values.
export function validateConfiguration(env) {
  // Parse APP_URL even when an explicit public host bypasses deployment fallback.
  // Match runtime syntax without importing TypeScript or installed dependencies.
  let appUrl;
  try { appUrl = new URL(env.SLATE_APP_URL); } catch { throw new Error('Invalid APP_URL.'); }
  if (!['http:', 'https:'].includes(appUrl.protocol)) throw new Error('Invalid APP_URL.');
  const publicHost = env.SLATE_PUBLIC_PAGE_HOST?.trim();
  if (publicHost && !/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(publicHost)) throw new Error('Invalid PUBLIC_PAGE_HOST.');
  if (env.SLATE_AI_PROVIDER && env.SLATE_AI_PROVIDER !== 'openai') throw new Error('Invalid hosted AI_PROVIDER.');
  const input = readDeploymentInput(env);
  let oauthConfigured = false;
  for (const provider of ['GOOGLE', 'SLACK', 'GITHUB']) {
    const id = env[`SLATE_${provider}_CLIENT_ID`]?.trim();
    const secret = env[`SLATE_${provider}_CLIENT_SECRET`]?.trim();
    if (id || secret) {
      if (!id || !secret) throw new Error('Incomplete OAuth configuration.');
      oauthConfigured = true;
    }
  }
  if (oauthConfigured && (env.SLATE_CONNECTOR_CREDENTIALS_KEY?.trim().length ?? 0) < 32) throw new Error('Invalid connector custody key.');
  const required = ['SLATE_SESSION_SECRET', 'SLATE_MAIL_API_KEY'];
  if (input.aiEnabled === 'true') required.push('SLATE_AI_API_KEY');
  if (input.ssoEnabled === 'true') required.push('SLATE_IDENTITY_CLIENT_SECRET');
  if (required.some(name => !env[name]?.trim())) throw new Error('Missing setup secret.');
}
