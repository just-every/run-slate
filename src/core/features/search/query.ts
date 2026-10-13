import {publishedImportContainerSql} from '../imports/publication';
import type { FeatureContext } from '../../app/feature-context';
import type { MemberSubject } from '../../shared/knowledge/model';
import type { SearchInput } from './service';
import { recordScope } from './record-index';
import { candidateMatch } from './tokens';
import { accessSql, pageAccessLevelSql } from './access-sql';

export async function searchQuery(ctx:FeatureContext,subject:MemberSubject,input:SearchInput,terms:string[],snapshot?:string) {
 const values:(string|number|null)[]=[];
 const bind=(v:string|number|null)=>{values.push(v);return '?'+values.length;};
 const termList=bind(JSON.stringify(terms));
 const match=(alias:string)=>`NOT EXISTS(SELECT 1 FROM json_each(${termList}) q WHERE instr(${alias}.title_fold,q.value)=0 AND instr(${alias}.text_fold,q.value)=0)`;
 const expression=candidateMatch(terms),fts=expression?bind(expression):null;
 const workspace=bind(ctx.actor.workspaceId),kind=input.kind?`AND t.kind=${bind(input.kind)}`:'';
 const possible=match('t');
 const generation=!input.kind||input.kind==='record'?await recordScope(ctx,!!input.includeTrashed):null;
 const recordProjection=bind(JSON.stringify([ctx.actor.workspaceId,ctx.actor.id,!!input.includeTrashed]));
 const recordGeneration=bind(generation),nowParameter=bind(ctx.now);
 const acl=accessSql(subject,ctx.now,!!input.includeTrashed);let aclIndex=values.length;const aclSql=acl.sql.replace(/\?/g,()=>'?'+(++aclIndex));values.push(...acl.parameters);
 const filters=['1'];
 if(input.containerId)filters.push(`v.container_id=${bind(input.containerId)}`);
 if(input.contributorId)filters.push(`(v.author_id=${bind(input.contributorId)} OR ${bind(input.contributorId)} IN (SELECT value FROM json_each(v.contributors_json)))`);
 if(input.status)filters.push(`v.current_status=${bind(input.status)}`);
 if(input.updatedFrom)filters.push(`v.updated_at>=${bind(input.updatedFrom)}`);
 if(input.updatedTo)filters.push(`v.updated_at<=${bind(input.updatedTo)}`);
 if(!input.includeArchived)filters.push(`v.archived_at IS NULL AND COALESCE(v.lifecycle,'')<>'archived'`);
 if(!input.includeTrashed)filters.push(`v.trashed_at IS NULL`);
 const score=`COALESCE((SELECT SUM(CASE WHEN title_fold=q.value THEN 20 WHEN instr(title_fold,q.value)>0 THEN 10 ELSE 1 END) FROM json_each(${termList}) q),0)`;
 const snapshotFilter=snapshot?`AND v.key IN (SELECT j.value FROM discovery_snapshots snap,json_each(snap.ids_json) j WHERE snap.id=${bind(snapshot)})`:'';
 // Stream text candidates into the live ACL join. In particular, an unused published
 // variant must not double the permission work for a page with no unpublished changes.
 // Generations belong to a caller scope. The final source-page ACL cannot
 // distinguish related private values computed for another member.
 const ready=generation?`EXISTS(SELECT 1 FROM search_record_cache WHERE scope=${recordProjection} AND workspace_id=${workspace} AND generation=${recordGeneration} AND epoch=(SELECT epoch FROM search_record_epoch WHERE id=1) AND acl=(SELECT epoch FROM core_acl_epoch WHERE id=1) AND (expires_at IS NULL OR expires_at>${nowParameter}) AND as_of<=${nowParameter})`:'1';
 return {values,ready,sql:`WITH RECURSIVE candidates AS NOT MATERIALIZED (
 SELECT t.key,t.variant,t.kind,t.id,t.page_id,t.title_fold,NULL AS document_json,t.container_id,t.status,t.lifecycle,t.archived_at,t.trashed_at,t.author_id,t.updated_at,t.contributors_json FROM ${fts?'search_fts f CROSS JOIN search_text t ON t.rowid=f.rowid':'search_text t'} WHERE ${fts?`search_fts MATCH ${fts} AND `:''}t.workspace_id=${workspace} AND (t.kind<>'container' OR ${publishedImportContainerSql('t.id')}) ${kind} AND (t.kind<>'record' OR t.record_shared=1) AND (${possible}) AND (t.variant='working' OR EXISTS(SELECT 1 FROM pages vp WHERE vp.id=t.page_id AND vp.published_revision_id IS NOT NULL AND vp.published_revision_id<>vp.working_revision_id)) AND NOT EXISTS(SELECT 1 FROM search_dirty d WHERE d.key=t.key)
 UNION ALL SELECT t.key,'dynamic','record',json_extract(t.document_json,'$.id'),json_extract(t.document_json,'$.pageId'),t.title_fold,t.document_json,json_extract(t.document_json,'$.containerId'),json_extract(t.document_json,'$.status'),json_extract(t.document_json,'$.lifecycle'),json_extract(t.document_json,'$.archivedAt'),json_extract(t.document_json,'$.trashedAt'),json_extract(t.document_json,'$.authorId'),json_extract(t.document_json,'$.updatedAt'),json_extract(t.document_json,'$.contributors')
 FROM ${fts?'search_record_fts rf CROSS JOIN search_record_text t ON t.rowid=rf.rowid':'search_record_text t'}
 JOIN search_record_cache rc ON rc.scope=t.scope AND rc.generation=t.generation
 WHERE t.scope=${recordProjection} AND t.workspace_id=${workspace} AND rc.workspace_id=${workspace} AND t.generation=${recordGeneration} ${fts?`AND search_record_fts MATCH ${fts}`:''} AND ${match('t')}
 AND rc.epoch=(SELECT epoch FROM search_record_epoch WHERE id=1) AND rc.acl=(SELECT epoch FROM core_acl_epoch WHERE id=1) AND (rc.expires_at IS NULL OR rc.expires_at>${nowParameter}) AND rc.as_of<=${nowParameter}
 ),${aclSql},
 permissions AS (
 SELECT t.*,p.published_revision_id,p.working_revision_id,
 ${pageAccessLevelSql} AS access_level,
 CASE WHEN p.id IS NOT NULL AND EXISTS(SELECT 1 FROM page_verifications pv WHERE pv.page_id=p.id AND pv.id=(SELECT id FROM page_verifications WHERE page_id=p.id ORDER BY created_at DESC,id DESC LIMIT 1) AND pv.status_key=p.status_key AND (pv.expires_at<=s.now OR pv.revision_id<>p.working_revision_id)) THEN 'lapsed' ELSE t.status END AS current_status,
 c.id AS live_container,c.owned,c.visibility,s.guest,cl.level AS container_level
 FROM candidates t LEFT JOIN pages p ON p.id=t.page_id LEFT JOIN page_levels pl ON pl.id=t.page_id LEFT JOIN page_grants_live g ON g.page_id=t.page_id LEFT JOIN containers_live c ON c.id=t.container_id LEFT JOIN container_levels cl ON cl.id=c.id LEFT JOIN content_archive_locations l ON l.page_id=p.id,subject s
 ),variants AS (
 SELECT * FROM permissions t WHERE
 (t.page_id IS NOT NULL AND access_level>0 AND (t.variant='dynamic' AND json_extract(t.document_json,'$.revisionId')=CASE WHEN access_level<3 AND published_revision_id IS NOT NULL AND published_revision_id<>working_revision_id THEN published_revision_id ELSE (SELECT revision_id FROM pages WHERE id=t.page_id) END OR t.variant=CASE WHEN access_level<3 AND published_revision_id IS NOT NULL AND published_revision_id<>working_revision_id THEN 'published' ELSE 'working' END)
 OR t.page_id IS NULL AND t.variant='working' AND (t.kind='template' AND t.container_id IS NULL AND NOT guest OR live_container IS NOT NULL AND (owned OR visibility<>'personal' AND COALESCE(container_level,0)>0)))
 ), visible AS MATERIALIZED (
 SELECT v.key,v.variant,v.id,v.kind,v.document_json,v.current_status AS status,v.container_id AS containerId,${score} AS score,v.updated_at AS updatedAt
 FROM variants v WHERE ${filters.join(' AND ')} ${snapshotFilter}
 )`};
}
