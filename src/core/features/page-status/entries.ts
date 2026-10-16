import type { FeatureContext } from '../../app/feature-context';
import { currentSubject } from '../sharing/current-access';
export async function statusEntries(ctx:FeatureContext) {
  await currentSubject(ctx);
  return { items: (await ctx.db.prepare('SELECT key,label,color,requires_verification AS requiresVerification,retired_at AS retiredAt FROM status_entries WHERE workspace_id=?').bind(ctx.actor.workspaceId).all()).results };
}
