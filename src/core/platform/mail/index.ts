import { createMailSender } from '../../../../modules/mail/src/sender.mjs';
import { isLocalOrigin, type RuntimeConfig } from '../config/runtime';
import { fetchMail } from './fetch';

export interface OutboundMail { to: string; subject: string; text: string; html?: string; idempotencyKey?: string }
export interface Mailer { send(message: OutboundMail): Promise<{ id: string | null }> }
export class MailDeliveryError extends Error {
  constructor(message: string, readonly status: number | null, readonly retryable = true, readonly retryAfterSeconds?: number) { super(message); }
}
export interface MailerOptions { provider: 'rer' | 'resend' | 'sendgrid' | 'development'; from: string; apiKey?: string; relayUrl?: string; fetch?: typeof globalThis.fetch; db?: D1Database; localDevelopment?: boolean; appUrl?: string; demo?: boolean }

/** Native compatibility seam; all transport and provider classification belong to Base Mail. */
export function createMailer(options: MailerOptions): Mailer {
  if (!options.from.trim()) throw new Error('MAIL_FROM is required to create the mail adapter.');
  if (options.provider === 'development' && !options.demo && (!options.localDevelopment || !isLocalOrigin(options.appUrl))) throw new Error('Development mail requires LOCAL_DEVELOPMENT and a loopback APP_URL.');
  const fetcher = options.fetch ?? globalThis.fetch;
  return { async send(message) {
    let status: number | null = null;
    let detail = '';
    let retryAfterSeconds: number | undefined;
    const sender = createMailSender(options.provider === 'development'
      ? { provider: 'development', mode: 'development' }
      : { provider: options.provider, mode: 'production', apiKey: options.apiKey, ...(options.provider === 'rer' ? {relayUrl: options.relayUrl} : {}) }, {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await fetchMail(input, init, fetcher);
        status = response.status;
        const retryAfter = response.headers.get('Retry-After');
        if (response.status === 429 && retryAfter && /^\d+$/.test(retryAfter)) retryAfterSeconds = Number(retryAfter);
        if (!response.ok && options.provider !== 'rer') detail = (await response.clone().text()).replace(/\s+/g, ' ').slice(0, 400);
        return response;
      },
    });
    const deliveryId = message.idempotencyKey ?? crypto.randomUUID();
    const result = await sender.send({ deliveryId, from: options.from, to: [message.to], subject: message.subject, text: message.text, ...(message.html ? { html: message.html } : {}) });
    if (result.status === 'development') return { id: deliveryId };
    if (result.status === 'accepted' && options.provider === 'rer') return { id: result.providerMessageId };
    if (result.status === 'accepted' && result.providerMessageId) return { id: result.providerMessageId };
    throw new MailDeliveryError(`Transactional mail provider did not confirm acceptance${detail ? `: ${detail}` : '.'}`, status, result.status !== 'rejected', retryAfterSeconds);
  } };
}

export function identityMailer(config: RuntimeConfig, db: D1Database, from: string) {
  if (!config.mailProvider) throw new Error('MAIL_PROVIDER is required.');
  return createMailer({ provider: config.mailProvider, from, apiKey: config.mailApiKey, relayUrl: config.mailRelayUrl, db, localDevelopment: config.localDevelopment, appUrl: config.appUrl, demo: config.demo });
}
