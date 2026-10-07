import type { FeatureContext } from '../../app/feature-context';
export interface ScheduleProjection { publishAt: string; scheduleState: 'scheduled'|'failed'; scheduleFailure: string|null }
/** Only project a private scheduled page's timing into its author's already-authorized listings. */
export async function authorScheduleProjections(ctx: FeatureContext, pageIds: string[]): Promise<Map<string,ScheduleProjection>> {
  if (!pageIds.length) return new Map();
  const rows=await ctx.db.prepare("SELECT p.id,s.publish_at AS publishAt,s.state AS scheduleState,s.failure AS scheduleFailure FROM content_schedules s JOIN pages p ON p.id=s.page_id WHERE p.id IN (SELECT value FROM json_each(?)) AND p.workspace_id=? AND p.author_member_id=? AND p.lifecycle='scheduled' AND p.deleted_at IS NULL AND p.trashed_at IS NULL AND s.state IN ('scheduled','failed')").bind(JSON.stringify(pageIds),ctx.actor.workspaceId,ctx.actor.id).all<ScheduleProjection&{id:string}>();
  return new Map(rows.results.map(({id,...projection})=>[id,projection]));
}
