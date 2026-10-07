import type { FeatureContext } from '../../app/feature-context';
import type { MemberSubject } from '../../shared/knowledge/model';
import type { SearchInput } from './service';
import { documents,visibleDocuments } from './documents';
import { accessSql } from './access-sql';

/** Derived fields remain reader-specific; neither relation values nor permissions are cached. */
async function recordDocuments(ctx:FeatureContext,input:SearchInput) {
 if(input.kind&&input.kind!=='record')return [];
 const rows=(await ctx.db.prepare("SELECT 'record:'||id AS key FROM pages WHERE workspace_id=? AND page_kind='record' AND deleted_at IS NULL").bind(ctx.actor.workspaceId).all<{key:string}>()).results;
 if(!rows.length)return [];
 return visibleDocuments(ctx,await documents(ctx,rows.map(r=>r.key)),input.includeTrashed);
}
export async function searchQuery(ctx:FeatureContext,subject:MemberSubject,input:SearchInput,terms:string[],snapshot?:string) {
 const values:(string|number|null)[]=[];
 const bind=(v:string|number|null)=>{values.push(v);return '?'+values.length;};
 const match=(alias:string)=>terms.map(t=>`(instr(${alias}.title_fold,${bind(t)})>0 OR instr(${alias}.text_fold,${bind(t)})>0)`).join(' AND ')||'1';
 const workspace=bind(ctx.actor.workspaceId),kind=input.kind?`AND t.kind=${bind(input.kind)}`:'';
 const possible=match('t');
 const dynamic=JSON.stringify(await recordDocuments(ctx,input));
 const dynamicBind=bind(dynamic);
 const acl=accessSql(subject,ctx.now,!!input.includeTrashed);let aclIndex=values.length;const aclSql=acl.sql.replace(/\?/g,()=>'?'+(++aclIndex));values.push(...acl.parameters);
 const filters=['1'];
 if(input.containerId)filters.push(`v.container_id=${bind(input.containerId)}`);
 if(input.contributorId)filters.push(`(v.author_id=${bind(input.contributorId)} OR ${bind(input.contributorId)} IN (SELECT value FROM json_each(v.contributors_json)))`);
 if(input.status)filters.push(`v.current_status=${bind(input.status)}`);
 if(input.updatedFrom)filters.push(`v.updated_at>=${bind(input.updatedFrom)}`);
 if(input.updatedTo)filters.push(`v.updated_at<=${bind(input.updatedTo)}`);
 if(!input.includeArchived)filters.push(`v.archived_at IS NULL AND COALESCE(v.lifecycle,'')<>'archived'`);
 if(!input.includeTrashed)filters.push(`v.trashed_at IS NULL`);
 const score=terms.map(t=>`CASE WHEN title_fold=${bind(t)} THEN 20 WHEN instr(title_fold,${bind(t)})>0 THEN 10 ELSE 1 END`).join('+')||'0';
 const snapshotFilter=snapshot?`AND v.key IN (SELECT j.value FROM discovery_snapshots snap,json_each(snap.ids_json) j WHERE snap.id=${bind(snapshot)})`:'';
 // Dynamic text is normalized in JavaScript to preserve Unicode and retained span semantics.
 const dynamicRows=JSON.parse(dynamic) as Array<{title:string;text:string}>;
 // SQLite lower() is ASCII only, so these fields deliberately arrive already folded.
 values[values.indexOf(dynamic)]=JSON.stringify(dynamicRows.filter(r=>terms.every(t=>r.title.toLocaleLowerCase().includes(t)||r.text.toLocaleLowerCase().includes(t))).map(r=>({...r,title_fold:r.title.toLocaleLowerCase(),text_fold:r.text.toLocaleLowerCase()})));
 // Stream text candidates into the live ACL join. In particular, an unused published
 // variant must not double the permission work for a page with no unpublished changes.
 return {values,sql:`WITH RECURSIVE candidates AS NOT MATERIALIZED (
 SELECT t.key,t.variant,t.kind,t.id,t.page_id,t.title_fold,NULL AS document_json,t.container_id,t.status,t.lifecycle,t.archived_at,t.trashed_at,t.author_id,t.updated_at,t.contributors_json FROM search_text t WHERE t.workspace_id=${workspace} ${kind} AND t.kind<>'record' AND (${possible}) AND (t.variant='working' OR EXISTS(SELECT 1 FROM pages vp WHERE vp.id=t.page_id AND vp.published_revision_id IS NOT NULL AND vp.published_revision_id<>vp.working_revision_id)) AND NOT EXISTS(SELECT 1 FROM search_dirty d WHERE d.key=t.key)
 UNION ALL SELECT 'record:'||json_extract(j.value,'$.id'),'dynamic','record',json_extract(j.value,'$.id'),json_extract(j.value,'$.pageId'),json_extract(j.value,'$.title_fold'),j.value,json_extract(j.value,'$.containerId'),json_extract(j.value,'$.status'),json_extract(j.value,'$.lifecycle'),json_extract(j.value,'$.archivedAt'),json_extract(j.value,'$.trashedAt'),json_extract(j.value,'$.authorId'),json_extract(j.value,'$.updatedAt'),json_extract(j.value,'$.contributors') FROM json_each(${dynamicBind}) j
 ),${aclSql},
 permissions AS (
 SELECT t.*,p.published_revision_id,p.working_revision_id,
 CASE WHEN p.id IS NULL OR p.deleted_at IS NOT NULL OR p.workspace_id<>s.workspace OR NOT s.trash AND p.trashed_at IS NOT NULL OR c.id IS NULL OR c.visibility='personal' AND NOT c.owned THEN 0
 WHEN p.parent_page_id IS NOT NULL THEN COALESCE(pl.level,0)
 WHEN p.lifecycle IN ('draft','scheduled') OR p.lifecycle='archived' AND l.prior_lifecycle IN ('draft','scheduled') THEN CASE WHEN p.author_member_id=s.member THEN 4 ELSE COALESCE(g.private_level,0) END
 ELSE MAX(COALESCE(g.level,0),CASE WHEN p.access_inheritance='restricted' THEN 0 ELSE COALESCE(cl.level,0) END) END AS access_level,
 CASE WHEN p.id IS NOT NULL AND EXISTS(SELECT 1 FROM page_verifications pv WHERE pv.page_id=p.id AND pv.id=(SELECT id FROM page_verifications WHERE page_id=p.id ORDER BY created_at DESC,id DESC LIMIT 1) AND pv.status_key=p.status_key AND (pv.expires_at<=s.now OR pv.revision_id<>p.working_revision_id)) THEN 'lapsed' ELSE t.status END AS current_status,
 c.id AS live_container,c.owned,c.visibility,s.guest,cl.level AS container_level
 FROM candidates t LEFT JOIN pages p ON p.id=t.page_id LEFT JOIN page_levels pl ON pl.id=t.page_id LEFT JOIN page_grants_live g ON g.page_id=t.page_id LEFT JOIN containers_live c ON c.id=t.container_id LEFT JOIN container_levels cl ON cl.id=c.id LEFT JOIN content_archive_locations l ON l.page_id=p.id,subject s
 ),variants AS (
 SELECT * FROM permissions t WHERE
 (t.page_id IS NOT NULL AND access_level>0 AND (t.variant='dynamic' OR t.variant=CASE WHEN access_level<3 AND published_revision_id IS NOT NULL AND published_revision_id<>working_revision_id THEN 'published' ELSE 'working' END)
 OR t.page_id IS NULL AND t.variant='working' AND (t.kind='template' AND t.container_id IS NULL AND NOT guest OR live_container IS NOT NULL AND (owned OR visibility<>'personal' AND COALESCE(container_level,0)>0)))
 ), visible AS MATERIALIZED (
 SELECT v.key,v.variant,v.id,v.kind,v.document_json,v.current_status AS status,v.container_id AS containerId,${score} AS score,v.updated_at AS updatedAt
 FROM variants v WHERE ${filters.join(' AND ')} ${snapshotFilter}
 )`};
}
