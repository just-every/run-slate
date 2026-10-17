import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { requirePageLevel, requireContainerLevel, requireContainerAdministration } from '../sharing/current-access';
import { personalMutation } from './mutations';
import { requiredId } from './request';
export function setWatch(ctx:FeatureContext,input:{operationKey:string;pageId:string;enabled:boolean}) {
 requiredId(input.pageId);if(typeof input.enabled!=='boolean')throw new ApiProblem(400,'INVALID_WATCH','Supply enabled.');
 return personalMutation(ctx,{operationKey:input.operationKey,action:'watch.set',request:input,authorize:async()=>{if(input.enabled)await requirePageLevel(ctx,input.pageId,'view');},build:async()=>({
  statements:[ctx.db.prepare('INSERT INTO page_watches(member_id,page_id,created_at,enabled) SELECT ?,id,?,? FROM pages WHERE id=? AND workspace_id=? AND deleted_at IS NULL ON CONFLICT(member_id,page_id) DO UPDATE SET enabled=excluded.enabled,created_at=excluded.created_at').bind(ctx.actor.id,ctx.now,+input.enabled,input.pageId,ctx.actor.workspaceId)],value:{pageId:input.pageId,enabled:input.enabled}
 })});
}
/** Run in the authoring batch. INSERT OR IGNORE preserves an explicit opt-out. */
export function implicitWatchStatement(ctx:FeatureContext,pageId:string):D1PreparedStatement {
 return ctx.db.prepare(`INSERT OR IGNORE INTO page_watches(member_id,page_id,created_at,enabled)
 SELECT ?,?,?,1 WHERE COALESCE(
  (SELECT json_extract(value_json,'$.autowatch') FROM discovery_preferences WHERE member_id=?),
  (SELECT json_extract(content_json,'$.autowatch') FROM core_entity_revisions WHERE workspace_id=? AND entity_kind='watch-configuration' AND entity_id=? ORDER BY CAST(json_extract(content_json,'$.configurationSequence') AS INTEGER) DESC,id DESC LIMIT 1),1)=1`)
 .bind(ctx.actor.id,pageId,ctx.now,ctx.actor.id,ctx.actor.workspaceId,ctx.actor.workspaceId);
}
export function setContainerWatch(ctx:FeatureContext,input:{operationKey:string;containerId:string;enabled:boolean}) {
 requiredId(input.containerId);if(typeof input.enabled!=='boolean')throw new ApiProblem(400,'INVALID_WATCH','Supply enabled.');
 return personalMutation(ctx,{operationKey:input.operationKey,action:'container-watch.set',request:input,authorize:async()=>{if(input.enabled)await requireContainerLevel(ctx,input.containerId,'view');},build:async()=>({
  statements:[input.enabled?ctx.db.prepare('INSERT OR IGNORE INTO container_watches(member_id,container_id,created_at) VALUES(?,?,?)').bind(ctx.actor.id,input.containerId,ctx.now):ctx.db.prepare('DELETE FROM container_watches WHERE member_id=? AND container_id=?').bind(ctx.actor.id,input.containerId)],value:{containerId:input.containerId,enabled:input.enabled}
 })});
}
export async function containerWatchers(ctx:FeatureContext,containerId:string) {
 requiredId(containerId);await requireContainerAdministration(ctx,containerId);
 return {items:(await ctx.db.prepare("SELECT m.id,m.display_name AS displayName,w.created_at AS watchingSince FROM container_watches w JOIN members m ON m.id=w.member_id WHERE w.container_id=? AND m.workspace_id=? AND m.status='active' ORDER BY m.display_name,m.id").bind(containerId,ctx.actor.workspaceId).all<{id:string;displayName:string;watchingSince:string}>()).results};
}
