import {pageReadableSql,containerReadableSql} from './creation-access';
import type { FeatureContext } from '../../app/feature-context';
import type { NotificationDetail } from './visibility';
import { ApiProblem } from '../../app/problems';
export const notificationEvents=['mention','comment','reply','published','verification-lapsed','access-granted','access-requested','run-review','run-failed','decision-required','contradiction','experiment-result','maintenance'] as const;
export type NotificationEvent=typeof notificationEvents[number];
export interface NotificationFact { id:string; event:NotificationEvent; pageId?:string; containerId?:string; commentId?:string; recipientIds?:string[]; actorId?:string|null; detail?:NotificationDetail }
export type CreationEligibility=(memberSql:string,event:NotificationFact)=>{sql:string;values:(string|number|null)[]};
const creationResolvers=new Map<NotificationEvent,CreationEligibility>();
export function registerNotificationCreationEligibility(event:NotificationEvent,resolver:CreationEligibility){creationResolvers.set(event,resolver);}
/** Statements execute after the origin's writes, so atomic grants are visible at creation. */
export function notificationStatements(ctx:FeatureContext,event:NotificationFact):D1PreparedStatement[] {
 if(!event.id||!notificationEvents.includes(event.event)||(!event.pageId&&!event.containerId&&!(event.recipientIds?.length)))throw new ApiProblem(400,'INVALID_NOTIFICATION_EVENT','A scoped event and recipient or record are required.');
 if(!['comment','reply','published'].includes(event.event)&&!event.recipientIds?.length)return [];
 const governed=!!(event.detail?.runId||event.detail?.decisionId||event.detail?.inquiryId||event.detail?.experimentId);
 const extra=creationResolvers.get(event.event)?.('m',event)??{sql:governed?'0':'1',values:[]};
 return [ctx.db.prepare(`WITH fact AS (SELECT ? AS workspace,? AS page,? AS container,? AS at,? AS detail), eligible AS (SELECT m.id FROM members m,fact f WHERE m.workspace_id=f.workspace AND m.status='active' AND (f.page IS NULL OR ${pageReadableSql('m','f.page','f.workspace','f.at')}) AND (f.container IS NULL OR ${containerReadableSql('m','f.container','f.workspace','f.at')}) AND NOT EXISTS(SELECT 1 FROM json_each(json_extract(f.detail,'$.sourcePageIds')) source WHERE NOT (${pageReadableSql('m','source.value','f.workspace','f.at')})) AND (${extra.sql}))
 INSERT OR IGNORE INTO notification_outbox(id,workspace_id,actor_member_id,event,page_id,container_id,comment_id,recipients_json,watched_recipients_json,detail_json,created_at)
 VALUES(?,?,?,?,?,?,?,(SELECT json_group_array(value) FROM (SELECT value FROM json_each(?) UNION SELECT author_member_id AS value FROM pages WHERE id=? AND ? IN ('comment','reply')) WHERE value IN (SELECT id FROM eligible)),(SELECT json_group_array(member_id) FROM page_watches WHERE page_id=? AND ? IN ('comment','reply','published') AND member_id IN (SELECT id FROM eligible)),?,?)`).bind(ctx.actor.workspaceId,event.pageId??null,event.containerId??null,ctx.now,JSON.stringify(event.detail??{}),...extra.values,event.id,ctx.actor.workspaceId,event.actorId===undefined?ctx.actor.id:event.actorId,event.event,event.pageId??null,event.containerId??null,event.commentId??null,JSON.stringify(event.recipientIds??[]),event.pageId??null,event.event,event.pageId??null,event.event,JSON.stringify(event.detail??{}),ctx.now)];
}
export interface OutboxRow {id:string;workspace_id:string;actor_member_id:string|null;event:NotificationEvent;page_id:string|null;container_id:string|null;comment_id:string|null;recipients_json:string;watched_recipients_json:string;detail_json:string;created_at:string}
