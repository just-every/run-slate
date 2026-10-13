import { createD1DevelopmentOutbox, createDevelopmentOutboxHandler } from '../../../modules/mail/src/development/index.mjs';
import { devGate } from '../../../modules/operator-auth/index.mjs';
import { isLocalOrigin } from '../platform/config/runtime';
import type { AppBindings } from './types';

/**
 * Dispatch before configuration/session checks so hosted and hostile hosts reveal nothing.
 * The local key gate guards the outbox and its key exchange: a tunnel can make a
 * remote request look local, so holding RER_DEV_KEY is what admits a browser.
 */
export async function developmentOutbox(request: Request, bindings: AppBindings): Promise<Response | null> {
  const url = new URL(request.url);
  const outbox = url.pathname === '/__dev/outbox' || url.pathname.startsWith('/__dev/outbox/');
  if (!outbox && url.pathname !== '/__dev/key') return null;
  const missing = () => new Response('Not found.', { status: 404 });
  if (bindings.LOCAL_DEVELOPMENT !== 'true' || bindings.MAIL_PROVIDER !== 'development' || !isLocalOrigin(bindings.APP_URL)) return missing();
  const origin = new URL(bindings.APP_URL);
  if (url.origin !== origin.origin || request.headers.get('host') !== origin.host || url.username || url.password) return missing();
  const gate = devGate({ key: bindings.RER_DEV_KEY, origin: bindings.APP_URL, local: true });
  if (!gate) return missing();
  if (!outbox) return await gate.exchange(request) ?? missing();
  if (!await gate.admits(request)) return missing();
  const handler = createDevelopmentOutboxHandler({ local: true, origin: bindings.APP_URL, outbox: createD1DevelopmentOutbox({ db: bindings.DB }) });
  return await handler(request) ?? missing();
}
