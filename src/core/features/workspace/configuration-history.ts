import type { FeatureContext } from '../../app/feature-context';
import { mutationGuard } from '../../app/operations';
import { identityRevision } from './revisions';
type ConfigurationKind='sharing-configuration'|'navigation-configuration'|'watch-configuration';
const currentQuery="SELECT id FROM core_entity_revisions WHERE workspace_id=? AND entity_kind=? AND entity_id=? ORDER BY CAST(json_extract(content_json,'$.configurationSequence') AS INTEGER) DESC,id DESC LIMIT 1";
/** Configuration history is authoritative. Sequence order survives clock skew and archive reordering. */
export async function configurationHistory<T>(ctx:FeatureContext,kind:ConfigurationKind) {
  const row=await ctx.db.prepare(`SELECT id,content_json FROM core_entity_revisions WHERE id=(${currentQuery})`).bind(ctx.actor.workspaceId,kind,ctx.actor.workspaceId).first<{id:string;content_json:string}>();
  return row?{revisionId:row.id,value:JSON.parse(row.content_json) as T&{configurationSequence:number}}:null;
}
export async function configurationStatements<T extends object>(ctx:FeatureContext,kind:ConfigurationKind,revisionId:string,expectedRevisionId:string|null,value:T) {
  const prior=await configurationHistory<T>(ctx,kind),configurationSequence=(prior?.value.configurationSequence??0)+1;
  const params=[ctx.actor.workspaceId,kind,ctx.actor.workspaceId];
  return [mutationGuard(ctx.db,`SELECT (${currentQuery}) IS ?`,[...params,expectedRevisionId]),await identityRevision(ctx,revisionId,kind,ctx.actor.workspaceId,{...value,configurationSequence})];
}
