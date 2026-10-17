import { ownerIdentity } from '../../../ext/config';
import { createAuthHandler, createOperatorAuth, type AuthConfig } from '../../../../modules/operator-auth/index.mjs';
import { devAdmitted } from '../../../../modules/operator-auth/dev-admission.mjs';
import type { RuntimeConfig } from '../../platform/config/runtime';
import { sessionDigest } from '../../platform/auth/token';
import { namedSender } from '../../platform/mail/sender';
import { identityMailSender, type SignInDelivery } from './mail-sender';
import { bootstrapOwner } from '../workspace/bootstrap';
import { createNativeAccounts } from './native/accounts';
import { createNativeProofs } from './native/proofs';
import { sessionStore, type SessionStore } from './native/store';

import { PROVIDER_ID, PROVIDER_CALLBACK } from './paths';
export { PROVIDER_ID, PROVIDER_START, PROVIDER_CALLBACK } from './paths';
export const clientIp = (request: Request) => request.headers.get('cf-connecting-ip') ?? 'local';

function providerConfig(config: RuntimeConfig, origin: string) {
  const pin = config.identityProvider;
  if (!pin) return [];
  const origins = [...new Set([pin.issuer, pin.authorizationEndpoint, pin.tokenEndpoint, pin.jwksUri].map(value => new URL(value).origin))];
  return [{
    id: PROVIDER_ID, preset: 'legacy-rs256' as const, issuer: pin.issuer, clientId: pin.clientId, clientSecret: pin.clientSecret,
    tokenAuthMethod: pin.tokenAuthMethod, redirectUri: `${origin}${PROVIDER_CALLBACK}`, endpointOrigins: origins,
    endpointPins: { authorization: pin.authorizationEndpoint, token: pin.tokenEndpoint, jwks: pin.jwksUri },
  }];
}

/** Changing any trusted provider value advances the policy generation. */
const fingerprint = (config: RuntimeConfig) => {
  const pin = config.identityProvider;
  return pin ? JSON.stringify([pin.issuer, pin.clientId, pin.authorizationEndpoint, pin.tokenEndpoint, pin.jwksUri, pin.tokenAuthMethod]) : 'disabled';
};

/** Base's pages and mail name the app as its mail sender does. */
export const slateBranding = (config: Pick<RuntimeConfig, 'appName' | 'preview'>) => ({ productName: config.preview ? `${config.appName} (preview)` : config.appName, accentColor: '#1b1b18', signInPath: '/signin', theme: '/rer-theme.css' });

/**
 * Base keys email-token and rate digests with SESSION_SECRET; Slate derives that
 * key from its own session secret so any existing secret length keeps working.
 */
async function baseConfig(config: RuntimeConfig): Promise<AuthConfig> {
  const origin = new URL(config.appUrl!).origin;
  return {
    origin, local: config.localDevelopment, OWNER_EMAIL: config.setupOwnerEmail!, MAIL_FROM: namedSender(config),
    ...(config.setupToken ? { SETUP_TOKEN: config.setupToken } : {}),
    SESSION_SECRET: await sessionDigest(config.sessionSecret, 'slate:operator-auth:v1'),
    branding: slateBranding(config),
    linkSeconds: 3600, dependencies: true,
    providers: providerConfig(config, origin),
    ...(config.identityProvider ? { OIDC_TRANSACTION_SECRET: config.identityProvider.transactionSecret } : {}),
  };
}

export function slateSessions(db: D1Database, config: RuntimeConfig): SessionStore {
  return sessionStore(db, {
    secret: config.sessionSecret, secure: new URL(config.appUrl!).protocol === 'https:',
    identityEnabled: !!config.identityProvider, devAdmitted,
  });
}

/** Base operator-auth composed over Slate's native accounts and proofs for one request. */
export async function createSlateAuth(db: D1Database, config: RuntimeConfig, options: { waitUntil?: (promise: Promise<unknown>) => void; delivery?: SignInDelivery } = {}) {
  const clock = Date.now, store = slateSessions(db, config);
  const accounts = createNativeAccounts(store, { clock, providerFingerprint: fingerprint(config), claimOwner: email => bootstrapOwner(db, config, email, ownerIdentity.name) });
  const auth = createOperatorAuth({
    db, config: await baseConfig(config), accounts, proofs: createNativeProofs(store),
    mailSender: identityMailSender(db, config, options.delivery ?? {}), clientIp, clock,
    ...(options.waitUntil ? { waitUntil: options.waitUntil } : {}),
  });
  return { auth, accounts, handle: createAuthHandler(auth) };
}
