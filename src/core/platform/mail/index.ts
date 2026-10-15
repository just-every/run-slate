import { createMailSender } from '../../../../modules/mail/src/sender.mjs';
import { createD1DevelopmentOutbox } from '../../../../modules/mail/src/development/index.mjs';
import { isLocalOrigin, type RuntimeConfig } from '../config/runtime';

export interface OutboundMail { to: string; subject: string; text: string; html?: string; idempotencyKey?: string }
export interface Mailer { send(message: OutboundMail): Promise<{ id: string }> }
export class MailDeliveryError extends Error {
  constructor(message: string, readonly status: number | null, readonly retryable = true) { super(message); }
}
export interface MailerOptions { provider: 'resend' | 'sendgrid' | 'development'; from: string; apiKey?: string; fetch?: typeof globalThis.fetch; db?: D1Database; localDevelopment?: boolean; appUrl?: string; demo?: boolean }

/** Native compatibility seam; all transport and provider classification belong to Base Mail. */
export function createMailer(options: MailerOptions): Mailer {
  if (!options.from.trim()) throw new Error('MAIL_FROM is required to create the mail adapter.');
  if (options.provider === 'development' && !options.demo && (!options.localDevelopment || !isLocalOrigin(options.appUrl))) throw new Error('Development mail requires LOCAL_DEVELOPMENT and a loopback APP_URL.');
  if (options.provider === 'development' && !options.db) throw new Error('Development mail requires a database.');
  const outbox = options.provider === 'development' ? createD1DevelopmentOutbox({db: options.db!}) : undefined;
  const fetcher = options.fetch ?? globalThis.fetch;
  return { async send(message) {
    let status: number | null = null;
    let detail = '';
    const sender = createMailSender(options.provider === 'development'
      ? { provider: 'development', mode: 'development' }
      : { provider: options.provider, mode: 'production', apiKey: options.apiKey }, {
      ...(options.provider === 'development' ? { outbox } : {}),
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await fetcher(input, init);
        status = response.status;
        if (!response.ok) detail = (await response.clone().text()).replace(/\s+/g, ' ').slice(0, 400);
        return response;
      },
    });
    const deliveryId = message.idempotencyKey ?? crypto.randomUUID();
    const result = await sender.send({ deliveryId, from: options.from, to: [message.to], subject: message.subject, text: message.text, ...(message.html ? { html: message.html } : {}) });
    if (result.status === 'development') return { id: deliveryId };
    if (result.status === 'accepted' && result.providerMessageId) return { id: result.providerMessageId };
    throw new MailDeliveryError(`Transactional mail provider did not confirm acceptance${detail ? `: ${detail}` : '.'}`, status, result.status !== 'rejected');
  } };
}

export function identityMailer(config: RuntimeConfig, db: D1Database, from: string) {
  if (!config.mailProvider) throw new Error('MAIL_PROVIDER is required.');
  return createMailer({ provider: config.mailProvider, from, apiKey: config.mailApiKey, db, localDevelopment: config.localDevelopment, appUrl: config.appUrl, demo: config.demo });
}
