import type { MailSender } from '../../../../modules/operator-auth/index.mjs';
import { createMailSender } from '../../../../modules/mail/src/sender.mjs';
import { createD1DevelopmentOutbox } from '../../../../modules/mail/src/development/index.mjs';
import type { RuntimeConfig } from '../../platform/config/runtime';
import { TENANT } from './native/store';

export interface SignInDelivery { requestDigest?: string; failure?: string }

/**
 * Base Mail for Base's email links. A requested sign-in also records its
 * accepted or refused delivery, keyed by the requester's status digest, so the
 * sign-in screen and the owner's mail list keep reporting provider outcomes.
 */
export function identityMailSender(db: D1Database, config: RuntimeConfig, delivery: SignInDelivery): MailSender | undefined {
  if (!config.mailProvider) return undefined;
  const sender = createMailSender(config.mailProvider === 'development'
    ? { provider: 'development', mode: 'development' }
    : { provider: config.mailProvider, mode: 'production', apiKey: config.mailApiKey, ...(config.mailProvider === 'rer' ? {relayUrl: config.mailRelayUrl} : {}) }, config.mailProvider === 'development' ? { outbox: createD1DevelopmentOutbox({ db }) } : {});
  async function record(id: string, to: string, result: { status: string; providerMessageId: string | null; code?: string } | null) {
    const sent = result?.status === 'accepted' || result?.status === 'development';
    delivery.failure = sent ? undefined : config.mailProvider === 'rer'
      ? 'Managed mail could not send this email. Check mail in your Run Edit Run hosting settings'
      : `${config.mailProvider} ${result?.status ?? 'transport failure'}${result?.code ? `: ${result.code}` : ''}`;
    if (!delivery.requestDigest) return;
    const now = new Date().toISOString();
    await db.batch([
      db.prepare('DELETE FROM mail_deliveries WHERE request_digest=?').bind(delivery.requestDigest),
      db.prepare(`INSERT INTO mail_deliveries (id,workspace_id,kind,target_email,member_id,state,attempt_count,provider,provider_message_id,error_detail,first_attempted_at,last_attempted_at,sent_at,failed_at,created_at,updated_at,request_digest,delivery_phase)
        SELECT ?,${TENANT},'sign-in-link',?,(SELECT id FROM members WHERE workspace_id=${TENANT} AND lower(email)=?),?,1,?,?,?,?,?,?,?,?,?,?,?`)
        .bind(id, to, to, sent ? 'sent' : 'failed', config.mailProvider!, result?.providerMessageId ?? null, delivery.failure ?? null, now, now, sent ? now : null, sent ? null : now, now, now, delivery.requestDigest, sent ? 'sent' : 'failed'),
    ]);
  }
  return {
    async send(message) {
      let result;
      // Base auth's Auto-Submitted header has no relay representation. RER owns
      // message headers, sender and installation identity on this transport.
      const { headers: _headers, ...relayMessage } = message;
      try { result = await sender.send(config.mailProvider === 'rer' ? relayMessage : message); }
      catch (cause) { await record(message.deliveryId, message.to[0]!, null); throw cause; }
      await record(message.deliveryId, message.to[0]!, result);
      return result;
    },
  };
}
