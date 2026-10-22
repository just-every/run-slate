import {pageReadableSql,containerReadableSql} from './creation-access';
import type { FeatureContext } from '../../app/feature-context';
import type { NotificationDetail } from './visibility';
import { ApiProblem } from '../../app/problems';
export const watchedEvents=['comment','reply','published','page-created','page-edited','page-moved','page-archived','page-trashed','page-restored','post-published'] as const;
export const notificationEvents=['backup-failed','review-requested','review-overdue','review-escalated','task-assigned','task-due','reminder','mention',...watchedEvents,'verification-lapsed','verification-rules','access-granted','access-requested','run-review','run-failed','decision-required','contradiction','experiment-result','maintenance'] as const;
export type NotificationEvent=typeof notificationEvents[number];
export interface NotificationFact { id:string; event:NotificationEvent; pageId?:string; containerId?:string; commentId?:string; recipientIds?:string[]; actorId?:string|null; detail?:NotificationDetail }
export type CreationEligibility=(memberSql:string,event:NotificationFact)=>{sql:string;values:(string|number|null)[]};
const creationResolvers=new Map<NotificationEvent,CreationEligibility>();
export function registerNotificationCreationEligibility(event:NotificationEvent,resolver:CreationEligibility){creationResolvers.set(event,resolver);}
/** Statements execute after the origin's writes, so atomic grants are visible at creation.
 * Extra container IDs select former-container watchers after a move; they are never payload.
 * `containerWatchers` false reaches page watchers only (a live page's re-publication, `CONT-012`). */
export function notificationStatements(ctx:FeatureContext,event:NotificationFact,options:{containerIds?:string[];editingSession?:boolean;containerWatchers?:boolean}={}):D1PreparedStatement[] {
 if(!event.id||!notificationEvents.includes(event.event)||(!event.pageId&&!event.containerId&&!(event.recipientIds?.length)))throw new ApiProblem(400,'INVALID_NOTIFICATION_EVENT','A scoped event and recipient or record are required.');
 const watched=(watchedEvents as readonly string[]).includes(event.event);
 if(!watched&&!event.recipientIds?.length)return [];
 const governed=!!(event.detail?.reviewRequestId||event.detail?.runId||event.detail?.decisionId||event.detail?.inquiryId||event.detail?.experimentId);
 const extra=ctx.localDevelopment&&event.event==='maintenance'&&!governed
  ? {sql:'1',values:[]}
  : creationResolvers.get(event.event)?.('m',event)??{sql:governed?'0':'1',values:[]};
 const pageRead=pageReadableSql('m','f.page','f.workspace','f.at',event.event==='page-trashed');
 const id=options.editingSession?"COALESCE((SELECT 'watch-edit:'||session_id FROM watch_edit_sessions WHERE page_id=? AND actor_member_id=?),?)":'?';
 const idValues=options.editingSession?[event.pageId!,ctx.actor.id,event.id]:[event.id];
 return [ctx.db.prepare(`WITH fact AS MATERIALIZED (SELECT ? AS workspace,? AS page,? AS container,? AS at,? AS detail),
 eligible AS MATERIALIZED (SELECT m.id FROM members m,fact f WHERE m.workspace_id=f.workspace AND m.status='active'
 AND (f.page IS NULL OR ${pageRead}) AND (f.container IS NULL OR ${containerReadableSql('m','f.container','f.workspace','f.at')})
 AND NOT EXISTS(SELECT 1 FROM json_each(json_extract(f.detail,'$.sourcePageIds')) source WHERE NOT (${pageReadableSql('m','source.value','f.workspace','f.at')})) AND (${extra.sql})),
 watched AS MATERIALIZED (SELECT member_id FROM page_watches WHERE page_id=? AND enabled=1
 UNION SELECT member_id FROM container_watches WHERE ?=1 AND container_id IN (SELECT container_id FROM pages WHERE id=? UNION SELECT value FROM json_each(?)))
 INSERT OR IGNORE INTO notification_outbox(id,workspace_id,actor_member_id,event,page_id,container_id,comment_id,recipients_json,watched_recipients_json,detail_json,created_at)
 SELECT ${id},?,?,?,?,?,?,
 (SELECT json_group_array(value) FROM (SELECT value FROM json_each(?) UNION SELECT author_member_id FROM pages WHERE id=? AND ? IN ('comment','reply')) WHERE value IN (SELECT id FROM eligible)),
 (SELECT json_group_array(member_id) FROM watched WHERE ?=1 AND member_id IN (SELECT id FROM eligible)
 AND EXISTS(SELECT 1 FROM pages p LEFT JOIN content_archive_locations a ON a.page_id=p.id WHERE p.id=? AND COALESCE(a.prior_lifecycle,p.lifecycle) NOT IN ('draft','scheduled'))),?,?
 WHERE ?=0 OR EXISTS(SELECT 1 FROM pages p LEFT JOIN content_archive_locations a ON a.page_id=p.id WHERE p.id=? AND COALESCE(a.prior_lifecycle,p.lifecycle) NOT IN ('draft','scheduled'))`)
 .bind(ctx.actor.workspaceId,event.pageId??null,event.containerId??null,ctx.now,JSON.stringify(event.detail??{}),...extra.values,
 event.pageId??null,+(options.containerWatchers??true),event.pageId??null,JSON.stringify(options.containerIds??[]),...idValues,
 ctx.actor.workspaceId,event.actorId===undefined?ctx.actor.id:event.actorId,event.event,event.pageId??null,event.containerId??null,event.commentId??null,
 JSON.stringify(event.recipientIds??[]),event.pageId??null,event.event,+watched,event.pageId??null,JSON.stringify(event.detail??{}),ctx.now,+(event.event.startsWith('page-')||event.event==='post-published'),event.pageId??null)];
}
export interface OutboxRow {id:string;workspace_id:string;actor_member_id:string|null;event:NotificationEvent;page_id:string|null;container_id:string|null;comment_id:string|null;recipients_json:string;watched_recipients_json:string;detail_json:string;created_at:string}
