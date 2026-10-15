/** Transports without duplicate suppression cannot replay an ambiguous send. */
export async function holdUncertainMail(db: D1Database, id: string, now: string, provider: 'sendgrid' | 'rer') {
  const label = provider === 'rer' ? 'RER mail relay' : 'SendGrid';
  await db.prepare("UPDATE mail_deliveries SET state='failed',delivery_phase='uncertain',error_detail=?,lease_until=NULL,next_attempt_at=NULL,updated_at=? WHERE id=? AND delivery_phase='sending'")
    .bind(`${label} acceptance is uncertain; provider receipt review is required. No automatic resend.`, now, id).run();
}
