import type {FeatureContext} from '../../app/feature-context';
/** Configuration is retained, but an erased page's identity leaves every historical selection. */
export function eraseHomeReferences(ctx:FeatureContext,pageIds:string[]):D1PreparedStatement[]{
 const ids=JSON.stringify(pageIds);
 return [ctx.db.prepare(`UPDATE core_entity_revisions SET content_hash='',content_json=json_set(content_json,
 '$.pageId',CASE WHEN json_extract(content_json,'$.pageId') IN (SELECT value FROM json_each(?)) THEN NULL ELSE json_extract(content_json,'$.pageId') END,
 '$.linkPageIds',json((SELECT json_group_array(value) FROM json_each(core_entity_revisions.content_json,'$.linkPageIds') WHERE value NOT IN (SELECT value FROM json_each(?)))),
 '$.keyPageIds',json((SELECT json_group_array(value) FROM json_each(core_entity_revisions.content_json,'$.keyPageIds') WHERE value NOT IN (SELECT value FROM json_each(?)))))
 WHERE workspace_id=? AND entity_kind IN ('container-home','company-hub') AND content_json<>'{}'`).bind(ids,ids,ids,ctx.actor.workspaceId)];
}
