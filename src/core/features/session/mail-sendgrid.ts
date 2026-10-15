import { createMailSender } from '../../../../modules/mail/src/sender.mjs';
import type { RuntimeConfig } from '../../platform/config/runtime';
import type { MailPayload } from './mail-admission';
import type { MailRow } from './mail-authority';
import { holdUncertainMail } from './mail-uncertain';

/** One Base Mail submission, following the already committed attempt ownership. */
export async function deliverSendGridIdentity(db: D1Database, config: RuntimeConfig, row: MailRow, payload: MailPayload, attempt: number, now: string) {
  const result = await createMailSender({provider: 'sendgrid', mode: 'production', apiKey: config.mailApiKey!}).send({
    deliveryId: row.id, from: payload.from, to: [payload.to], subject: payload.subject, text: payload.text,
  });
  if (result.status === 'uncertain' || result.status === 'accepted' && !result.providerMessageId) {
    await holdUncertainMail(db, row.id, now, 'sendgrid');
    return;
  }
  if (result.status === 'accepted') {
    await db.prepare("UPDATE mail_deliveries SET state='sent',delivery_phase='sent',provider_message_id=?,sent_at=?,updated_at=?,lease_until=NULL,next_attempt_at=NULL,payload_ciphertext=NULL,error_detail=NULL WHERE id=? AND attempt_count=? AND delivery_phase='sending'").bind(result.providerMessageId, now, now, row.id, attempt).run();
    return;
  }
  // Explicit provider rejection is safe to expose for owner retry; never retry automatically.
  await db.prepare("UPDATE mail_deliveries SET state='failed',delivery_phase='failed',error_detail=?,failed_at=?,updated_at=?,lease_until=NULL,next_attempt_at=NULL WHERE id=? AND attempt_count=? AND delivery_phase='sending'").bind(`SendGrid ${result.status}: request not accepted.`, now, now, row.id, attempt).run();
}
