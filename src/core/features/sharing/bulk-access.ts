import type {FeatureContext} from '../../app/feature-context';
import type {KnowledgeGrant,PageLifecycle} from '../../shared/knowledge/model';
import {currentSubject,type CurrentAccess} from './current-access';
import {evaluatePageAccess,type PageAccessContext} from './access';
interface Page {id:string;workspace_id:string;container_id:string;parent_page_id:string|null;lifecycle:PageLifecycle;prior_lifecycle:PageLifecycle|null;author_member_id:string;access_inheritance:string;trashed_at:string|null}
interface Container {id:string;workspace_id:string;visibility:string;trashed_at:string|null;guests:'allowed'|'forbidden';publicLinks:'allowed'|'forbidden';anonymous:'allowed'|'forbidden';owned:number}
interface Grant extends KnowledgeGrant {targetId:string}
/** Bounded, reader-specific batch; no materialized permission cache is trusted. */
export async function resolveCurrentAccessMany(ctx:FeatureContext,pageIds:string[],options:{includeTrashed?:boolean;includeDeleted?:boolean}={}):Promise<Map<string,CurrentAccess>>{
 const subject=await currentSubject(ctx),result=new Map<string,CurrentAccess>();if(!pageIds.length)return result;
 // One query includes only requested pages and their ancestors, bounded by the product tree limit.
 const pages=(await ctx.db.prepare(`WITH RECURSIVE ancestors(id,depth) AS (SELECT value,0 FROM json_each(?) UNION SELECT p.parent_page_id,a.depth+1 FROM pages p JOIN ancestors a ON p.id=a.id WHERE p.parent_page_id IS NOT NULL AND a.depth<20) SELECT p.*,l.prior_lifecycle FROM pages p LEFT JOIN content_archive_locations l ON l.page_id=p.id WHERE p.id IN (SELECT id FROM ancestors) AND p.workspace_id=? AND (p.deleted_at IS NULL OR ?=1)`).bind(JSON.stringify([...new Set(pageIds)]),ctx.actor.workspaceId,+!!options.includeDeleted).all<Page>()).results;
 const byId=new Map(pages.map(p=>[p.id,p])),containerIds=JSON.stringify([...new Set(pages.map(p=>p.container_id))]),ids=JSON.stringify(pages.map(p=>p.id));
 const [containerRows,pageGrants,containerGrants]=await Promise.all([
  ctx.db.prepare(`SELECT c.id,c.workspace_id,c.visibility,c.trashed_at,EXISTS(SELECT 1 FROM container_owners o WHERE o.container_id=c.id AND o.member_id=?) AS owned,CASE WHEN c.guest_access='forbidden' OR w.guest_access='forbidden' THEN 'forbidden' ELSE 'allowed' END AS guests,CASE WHEN c.public_link_access='forbidden' OR w.public_link_access='forbidden' THEN 'forbidden' ELSE 'allowed' END AS publicLinks,CASE WHEN c.anonymous_access='forbidden' OR w.anonymous_access='forbidden' THEN 'forbidden' ELSE 'allowed' END AS anonymous FROM containers c JOIN workspaces w ON w.id=c.workspace_id WHERE c.id IN (SELECT value FROM json_each(?)) AND c.workspace_id=?`).bind(ctx.actor.id,containerIds,ctx.actor.workspaceId).all<Container>(),
  ctx.db.prepare('SELECT id,page_id AS targetId,principal_kind AS principalKind,principal_id AS principalId,level,expires_at AS expiresAt,revoked_at AS revokedAt FROM page_grants WHERE page_id IN (SELECT value FROM json_each(?))').bind(ids).all<Grant>(),
  ctx.db.prepare('SELECT id,container_id AS targetId,principal_kind AS principalKind,principal_id AS principalId,level,expires_at AS expiresAt,revoked_at AS revokedAt FROM container_grants WHERE container_id IN (SELECT value FROM json_each(?))').bind(containerIds).all<Grant>()
 ]);
 const containers=new Map(containerRows.results.map(c=>[c.id,c]));
 const pg=new Map<string,Grant[]>(),cg=new Map<string,Grant[]>();for(const g of pageGrants.results)pg.set(g.targetId,[...(pg.get(g.targetId)??[]),g]);for(const g of containerGrants.results)cg.set(g.targetId,[...(cg.get(g.targetId)??[]),g]);
 for(const id of pageIds){const p=byId.get(id);if(!p||p.trashed_at&&!options.includeTrashed)continue;const c=containers.get(p.container_id);if(!c||c.trashed_at&&!options.includeTrashed||c.visibility==='personal'&&!c.owned)continue;
  const eligible=(g:KnowledgeGrant)=>!((subject.isGuest||c.visibility==='personal')&&(g.principalKind==='workspace'||g.principalKind==='container'));
  const inherited:KnowledgeGrant[]=[];let blocked=p.access_inheritance==='restricted',parent=p.parent_page_id;const seen=new Set([id]);let valid=true;
  while(parent&&!blocked){if(seen.has(parent)){valid=false;break;}seen.add(parent);const ancestor=byId.get(parent);if(!ancestor||ancestor.container_id!==p.container_id){valid=false;break;}inherited.push(...(pg.get(parent)??[]));blocked=ancestor.access_inheritance==='restricted';parent=ancestor.parent_page_id;}
  if(!valid)continue;
  const lifecycle=p.lifecycle==='archived'&&(p.prior_lifecycle==='draft'||p.prior_lifecycle==='scheduled')?p.prior_lifecycle:p.lifecycle;
  const context:PageAccessContext={page:{id:p.id,workspaceId:p.workspace_id,containerId:p.container_id,lifecycle,authorMemberId:p.author_member_id,restricted:p.access_inheritance==='restricted',grants:(pg.get(id)??[]).filter(eligible)},container:{id:c.id,workspaceId:c.workspace_id,grants:blocked?[]:(cg.get(c.id)??[]).filter(eligible),externalAccess:{guests:c.guests,publicLinks:c.publicLinks,anonymous:c.anonymous}},inheritedGrants:inherited.filter(eligible)};
  result.set(id,{subject,context,decision:evaluatePageAccess(subject,context,ctx.now)});
 }
 return result;
}
