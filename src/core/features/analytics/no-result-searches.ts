import type { FeatureContext } from '../../app/feature-context';
import { requireContainerLevel } from '../sharing/current-access';
import { permitted } from '../search/visibility';

/** Count only first-page empty searches; never persist who made them. */
export async function recordNoResultSearch(ctx: FeatureContext, query: string, containerId?: string) {
  if (!query.trim()) return;
  if (containerId && !await permitted(() => requireContainerLevel(ctx, containerId, 'view'))) return;
  await ctx.db.prepare(`INSERT INTO analytics_no_result_searches(workspace_id,container_scope,query,day,searches) VALUES(?,?,?,?,1)
    ON CONFLICT(workspace_id,container_scope,query,day) DO UPDATE SET searches=searches+1`)
    .bind(ctx.actor.workspaceId, containerId ?? '', query.trim().normalize('NFC'), ctx.now.slice(0, 10)).run();
}
