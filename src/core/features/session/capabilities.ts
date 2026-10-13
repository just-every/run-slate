import type { RuntimeConfig } from '../../platform/config/runtime';

export interface SignInCapabilities {
  localOutbox: boolean;
  mailDelivery: boolean;
  identityProvider: boolean;
}

export function signInCapabilities(config: RuntimeConfig): SignInCapabilities {
  return {
    localOutbox: config.localDevelopment && config.mailProvider === 'development',
    mailDelivery: Boolean((config.mailApiKey || config.mailProvider === 'development') && config.mailFrom && config.appUrl),
    identityProvider: Boolean(config.ssoEnabled),
  };
}
