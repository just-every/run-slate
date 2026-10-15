import type { FeatureContext } from '../core/app/feature-context';
import type { RuntimeConfig } from '../core/platform/config/runtime';
import { slateSessions } from '../core/features/session/auth';
import { deliverIdentityMail, readMail } from '../core/features/session/mail';
import { openMailPayload } from '../core/features/session/mail-admission';
import { prepareInvitation, acceptInvitation } from '../core/features/workspace/invitations';

/** Complete real invitation acceptance with silently suppressed delivery. */
export async function seedTeam(ctx: FeatureContext, config: RuntimeConfig) {
  for (const email of ['maya.chen@demo.invalid', 'sam.rivera@demo.invalid']) {
    if (await slateSessions(ctx.db, config).member('lower(email)=lower(?)', email)) continue;
    const operationKey = `demo:invite:${email.split('@')[0]}`;
    await prepareInvitation(ctx, config, { operationKey, email, kind: 'member' });
    const row = await ctx.db.prepare('SELECT id,workspace_id,payload_ciphertext FROM mail_deliveries WHERE workspace_id=? AND requested_by_member_id=? AND operation_key=?')
      .bind(ctx.actor.workspaceId, ctx.actor.id, operationKey).first<{ id: string; workspace_id: string; payload_ciphertext: string | null }>();
    if (!row) throw new Error('Demo invitation was not admitted');
    const payload = await openMailPayload(config, row);
    const link = payload.text.match(/https?:\/\/\S+/)?.[0];
    const token = link && new URL(link).searchParams.get('token');
    if (!token) throw new Error('Demo invitation has no acceptance link');
    await deliverIdentityMail(ctx.db, config, row.id, ctx, ctx.now);
    if ((await readMail(ctx.db, row.id))?.state !== 'sent') throw new Error('Demo invitation was not acknowledged');
    await acceptInvitation(ctx.db, config, token, { files: ctx.files, jobs: ctx.jobs });
  }
}
