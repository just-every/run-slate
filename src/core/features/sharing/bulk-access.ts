import type {FeatureContext} from '../../app/feature-context';
import type {KnowledgeGrant,MemberSubject,PageLifecycle} from '../../shared/knowledge/model';
import {ApiProblem} from '../../app/problems';
import {currentSubject,type CurrentAccess} from './current-access';
import {evaluatePageAccess,type PageAccessContext} from './access';
interface Page {id:string;workspace_id:string;container_id:string;parent_page_id:string|null;lifecycle:PageLifecycle;prior_lifecycle:PageLifecycle|null;author_member_id:string;access_inheritance:string;trashed_at:string|null}
interface Container {id:string;workspace_id:string;visibility:string;trashed_at:string|null;guests:'allowed'|'forbidden';publicLinks:'allowed'|'forbidden';anonymous:'allowed'|'forbidden';owned:number}
interface Grant extends KnowledgeGrant {targetId:string}
/** Bounded, reader-specific batch; no materialized permission cache is trusted. */
export async function resolveCurrentAccessMany(ctx:FeatureContext,pageIds:string[],options:{includeTrashed?:boolean;includeDeleted?:boolean;subject?:MemberSubject;locationOverrides?:Record<string,{containerId:string;parentPageId:string|null}>}={}):Promise<Map<string,CurrentAccess>>{
 const subject=options.subject??await currentSubject(ctx),result=new Map<string,CurrentAccess>();if(!pageIds.length)return result;
 // UNION deduplicates ancestors so arbitrary depth and cycles terminate in SQL;
 // the walk below preserves the single-page resolver's cycle error. Tagged rows
 // keep each page, container and grant separate without multiplying joined grants.
 const rows=(await ctx.db.prepare(`WITH RECURSIVE
  locations AS (
   SELECT key AS id,json_extract(value,'$.containerId') AS container_id,json_extract(value,'$.parentPageId') AS parent_id FROM json_each(?)
  ),
  ancestors(id) AS (
   SELECT value FROM json_each(?)
   UNION
   SELECT CASE WHEN l.id IS NULL THEN p.parent_page_id ELSE l.parent_id END
   FROM pages p JOIN ancestors a ON p.id=a.id LEFT JOIN locations l ON l.id=p.id
   WHERE CASE WHEN l.id IS NULL THEN p.parent_page_id ELSE l.parent_id END IS NOT NULL
  ),
  selected_pages AS MATERIALIZED (
   SELECT p.id,p.workspace_id,
    CASE WHEN l.id IS NULL THEN p.container_id ELSE l.container_id END AS container_id,
    CASE WHEN l.id IS NULL THEN p.parent_page_id ELSE l.parent_id END AS parent_page_id,
    p.lifecycle,a.prior_lifecycle,p.author_member_id,p.access_inheritance,p.trashed_at
   FROM pages p LEFT JOIN locations l ON l.id=p.id LEFT JOIN content_archive_locations a ON a.page_id=p.id
   WHERE p.id IN (SELECT id FROM ancestors) AND p.workspace_id=? AND (p.deleted_at IS NULL OR ?=1)
  )
  SELECT 'page' AS kind,json_object('id',id,'workspace_id',workspace_id,'container_id',container_id,'parent_page_id',parent_page_id,'lifecycle',lifecycle,'prior_lifecycle',prior_lifecycle,'author_member_id',author_member_id,'access_inheritance',access_inheritance,'trashed_at',trashed_at) AS data FROM selected_pages
  UNION ALL
  SELECT 'container',json_object('id',c.id,'workspace_id',c.workspace_id,'visibility',c.visibility,'trashed_at',c.trashed_at,
   'owned',EXISTS(SELECT 1 FROM container_owners o WHERE o.container_id=c.id AND o.member_id=?),
   'guests',CASE WHEN c.guest_access='forbidden' OR w.guest_access='forbidden' THEN 'forbidden' ELSE 'allowed' END,
   'publicLinks',CASE WHEN c.public_link_access='forbidden' OR w.public_link_access='forbidden' THEN 'forbidden' ELSE 'allowed' END,
   'anonymous',CASE WHEN c.anonymous_access='forbidden' OR w.anonymous_access='forbidden' THEN 'forbidden' ELSE 'allowed' END)
  FROM containers c JOIN workspaces w ON w.id=c.workspace_id WHERE c.id IN (SELECT container_id FROM selected_pages)
  UNION ALL
  SELECT 'page-grant',json_object('id',id,'targetId',page_id,'principalKind',principal_kind,'principalId',principal_id,'level',level,'expiresAt',expires_at,'revokedAt',revoked_at)
  FROM page_grants WHERE page_id IN (SELECT id FROM selected_pages)
  UNION ALL
  SELECT 'container-grant',json_object('id',id,'targetId',container_id,'principalKind',principal_kind,'principalId',principal_id,'level',level,'expiresAt',expires_at,'revokedAt',revoked_at)
  FROM container_grants WHERE container_id IN (SELECT container_id FROM selected_pages)`)
  .bind(JSON.stringify(options.locationOverrides??{}),JSON.stringify([...new Set(pageIds)]),ctx.actor.workspaceId,+!!options.includeDeleted,ctx.actor.id)
  .all<{kind:'page'|'container'|'page-grant'|'container-grant';data:string}>()).results;
 const byId=new Map<string,Page>(),containers=new Map<string,Container>(),pg=new Map<string,Grant[]>(),cg=new Map<string,Grant[]>();
 for(const row of rows){
  if(row.kind==='page'){const page=JSON.parse(row.data) as Page;byId.set(page.id,page);}
  else if(row.kind==='container'){const container=JSON.parse(row.data) as Container;containers.set(container.id,container);}
  else{const grant=JSON.parse(row.data) as Grant,grants=row.kind==='page-grant'?pg:cg,list=grants.get(grant.targetId)??[];list.push(grant);grants.set(grant.targetId,list);}
 }
 for(const id of pageIds){const p=byId.get(id);if(!p||p.trashed_at&&!options.includeTrashed)continue;const c=containers.get(p.container_id);if(!c||c.trashed_at&&!options.includeTrashed||c.visibility==='personal'&&!c.owned)continue;
  const eligible=(g:KnowledgeGrant)=>!((subject.isGuest||c.visibility==='personal')&&(g.principalKind==='workspace'||g.principalKind==='container'));
  const inherited:KnowledgeGrant[]=[];let blocked=p.access_inheritance==='restricted',parent=p.parent_page_id;const seen=new Set([id]);let valid=true;
  while(parent&&!blocked){if(seen.has(parent))throw new ApiProblem(409,'TREE_CYCLE','The page tree contains a cycle.');seen.add(parent);const ancestor=byId.get(parent);if(!ancestor||ancestor.container_id!==p.container_id){valid=false;break;}inherited.push(...(pg.get(parent)??[]));blocked=ancestor.access_inheritance==='restricted';parent=ancestor.parent_page_id;}
  if(!valid)continue;
  const lifecycle=p.lifecycle==='archived'&&(p.prior_lifecycle==='draft'||p.prior_lifecycle==='scheduled')?p.prior_lifecycle:p.lifecycle;
  const context:PageAccessContext={page:{id:p.id,workspaceId:p.workspace_id,containerId:p.container_id,lifecycle,authorMemberId:p.author_member_id,restricted:p.access_inheritance==='restricted',grants:(pg.get(id)??[]).filter(eligible)},container:{id:c.id,workspaceId:c.workspace_id,grants:blocked?[]:(cg.get(c.id)??[]).filter(eligible),externalAccess:{guests:c.guests,publicLinks:c.publicLinks,anonymous:c.anonymous}},inheritedGrants:inherited.filter(eligible)};
  result.set(id,{subject,context,decision:evaluatePageAccess(subject,context,ctx.now)});
 }
 return result;
}
