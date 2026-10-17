import type { FeatureContext } from '../../app/feature-context';
import { currentSubject } from '../sharing/current-access';
import { visibleNotification, type NotificationRow, type NotificationView } from './service';
/** The member's delivered watch history, including comments addressed to an author.
 * Recheck every candidate before disclosure; a workspace feed cannot stand in for this. */
export async function following(ctx:FeatureContext) {
 await currentSubject(ctx);
 const rows=await ctx.db.prepare(`SELECT n.* FROM notifications n WHERE n.workspace_id=? AND n.recipient_member_id=? AND n.archived_at IS NULL
 AND (n.audience='watched' OR EXISTS(SELECT 1 FROM notification_outbox o,json_each(o.watched_recipients_json) w WHERE o.id=n.outbox_id AND w.value=n.recipient_member_id))
 ORDER BY n.created_at DESC,n.id DESC`).bind(ctx.actor.workspaceId,ctx.actor.id).all<NotificationRow>();
 const items:NotificationView[]=[];
 for(const row of rows.results){const item=await visibleNotification(ctx,row);if(item)items.push(item);if(items.length===30)break;}
 return {items};
}
