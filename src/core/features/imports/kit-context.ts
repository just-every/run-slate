import {classifyImportLockRace} from './lock-race';
import {d1RequestContext,type D1ImportContext,type D1Sql} from '../../../../modules/import-kit/src/d1/index.ts';
import {reserveReturn} from '../../../../modules/import-kit/src/d1/budget.ts';
import type {ImportRequestContext} from './request-context';
import {accessSql} from '../search/access-sql';
import {currentSubject,requirePageLevel} from '../sharing/current-access';
import {authorizeContainerCreation} from '../containers/service';
import {pageRow,writable} from '../pages/repository';
import {validatePrincipalMappings,type PrincipalMapping} from './principal-mapping';
import {nativeTargets,type NativeImportBinding} from './native-targets';

export interface ImportBinding extends NativeImportBinding {workspace_id:string;actor_id:string;import_generation:number;destination_page_id:string|null;expected_page_revision_id:string|null;mapping_json:string}
export async function kitContext(ctx:ImportRequestContext,job:ImportBinding):Promise<D1ImportContext> {
  await currentSubject(ctx);
  if(job.destination_page_id){await requirePageLevel(ctx,job.destination_page_id,'edit');writable(await pageRow(ctx,job.destination_page_id));}else await authorizeContainerCreation(ctx);
  const mappings=JSON.parse(job.mapping_json) as PrincipalMapping[];
  await validatePrincipalMappings(ctx,mappings);
  if(!ctx.nativeSessionId)throw new Error('Native import session binding is required.');
  const source=accessSql({memberId:ctx.actor.id,workspaceId:ctx.actor.workspaceId,groupIds:[],containerIds:[],isGuest:false,status:'active'},ctx.now,false).sql;
  const liveAccess=source.replace(/subject AS \(SELECT .*? AS trash\),/s,`subject AS (SELECT m.id AS member,m.workspace_id AS workspace,(SELECT json_group_array(group_id) FROM group_members WHERE member_id=m.id) AS groups,(SELECT json_group_array(container_id) FROM container_members WHERE member_id=m.id) AS containers,m.member_kind='guest' AS guest,strftime('%Y-%m-%dT%H:%M:%fZ','now') AS now,0 AS trash FROM members m WHERE m.id=? AND m.workspace_id=?),`).replace('WHERE p.parent_page_id IS NOT NULL AND p.id IN','WHERE p.id IN');
  // The Kit counts its statements from zero, but this request's budget also holds
  // what Slate has run so far, the 20-statement middleware reserve (980 of 1,000)
  // and Slate's own writes after the Kit returns. Reserve them so the Kit sizes
  // each batch to what is really left.
  return reserveReturn(d1RequestContext({
    destination:job.id,namespace:'slate-native-import',mappingVersion:'slate-native-v1',operationKey:`slate:${job.id}`,
    reversalPolicy:'preserve-conflicts',batchSize:8,maxBatches:1,maxBatchBytes:2_000_000,
    storage:{database:ctx.db,targets:nativeTargets(job,()=>ctx.sqlMetrics.writes)},
    authorization:{principalId:ctx.actor.id,predicate():D1Sql {
      const parts=["EXISTS(SELECT 1 FROM members m WHERE m.id=? AND m.workspace_id=? AND m.status='active' AND m.member_kind!='guest')",'EXISTS(SELECT 1 FROM federation_imports WHERE id=? AND actor_id=? AND workspace_id=? AND state!=\'deleted\' AND import_generation=?)'];
      const params:unknown[]=[ctx.actor.id,ctx.actor.workspaceId,job.id,ctx.actor.id,ctx.actor.workspaceId,job.import_generation];
      parts.push("EXISTS(SELECT 1 FROM sessions s JOIN members m ON m.id=s.member_id WHERE s.id=? AND s.member_id=? AND m.workspace_id=? AND s.revoked_at IS NULL AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))");params.push(ctx.nativeSessionId,ctx.actor.id,ctx.actor.workspaceId);
      // Destination access was resolved from this epoch before the batch. New
      // imported grants change it, so compare existing destination facts too.
      if(job.destination_page_id){parts.push('EXISTS(SELECT 1 FROM pages WHERE id=? AND revision_id=? AND locked_at IS NULL AND deleted_at IS NULL AND archived_at IS NULL AND trashed_at IS NULL)');params.push(job.destination_page_id,job.expected_page_revision_id);parts.push(`(WITH RECURSIVE candidates AS (SELECT ? AS page_id),${liveAccess} SELECT EXISTS(SELECT 1 FROM page_levels WHERE id=? AND level>=3))`);params.push(job.destination_page_id,ctx.actor.id,ctx.actor.workspaceId,job.destination_page_id);}
      else {parts.push("EXISTS(SELECT 1 FROM members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.id=? AND (m.role='owner' OR w.member_container_creation='allowed'))");params.push(ctx.actor.id);}
      parts.push("NOT EXISTS(SELECT 1 FROM json_each(?) x WHERE (json_extract(x.value,'$.kind')='member' AND NOT EXISTS(SELECT 1 FROM members m WHERE m.id=json_extract(x.value,'$.targetId') AND m.workspace_id=? AND m.status='active')) OR (json_extract(x.value,'$.kind')='group' AND NOT EXISTS(SELECT 1 FROM groups g WHERE g.id=json_extract(x.value,'$.targetId') AND g.workspace_id=?)))");params.push(JSON.stringify(mappings),ctx.actor.workspaceId,ctx.actor.workspaceId);

      const predicate={sql:parts.map(p=>`(${p})`).join(' AND '),params};
      if(job.destination_page_id)ctx.rejectedImportBatch=(error,statements)=>classifyImportLockRace(ctx,job,predicate,statements,error);
      return predicate;
    }},
  }),ctx.sqlMetrics.statements+SLATE_REQUEST_TAIL);
}
const SLATE_REQUEST_TAIL=60;
