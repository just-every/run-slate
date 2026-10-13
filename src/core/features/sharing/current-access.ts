import {requireImportPublication} from '../imports/publication';
import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import type { AccessLevel, KnowledgeGrant, MemberSubject, PageLifecycle } from '../../shared/knowledge/model';
import { can, evaluatePageAccess, type AccessDecision, type PageAccessContext } from './access';
export interface AccessResolutionOptions { includeTrashed?:boolean; locationOverrides?:Record<string,{containerId:string;parentPageId:string|null}> }
export interface CurrentAccess { subject: MemberSubject; context: PageAccessContext; decision: AccessDecision }
const grants = (db:D1Database, table:'page_grants'|'container_grants', key:string, id:string) => db.prepare(`SELECT id,principal_kind AS principalKind,principal_id AS principalId,level,expires_at AS expiresAt,revoked_at AS revokedAt FROM ${table} WHERE ${key}=?`).bind(id).all<KnowledgeGrant>();
export async function currentSubject(ctx:FeatureContext):Promise<MemberSubject> {
  ctx.authorizationEpoch ??= (await ctx.db.prepare('SELECT epoch FROM core_acl_epoch WHERE id=1').first<{epoch:number}>())!.epoch;
  const row=await ctx.db.prepare('SELECT status,member_kind FROM members WHERE id=? AND workspace_id=?').bind(ctx.actor.id,ctx.actor.workspaceId).first<{status:MemberSubject['status'];member_kind:string}>();
  if (!row || row.status!=='active') throw new ApiProblem(401,'UNAUTHENTICATED','An active membership is required.');
  const [groups,containers]=await Promise.all([ctx.db.prepare('SELECT gm.group_id AS id FROM group_members gm JOIN groups g ON g.id=gm.group_id JOIN members m ON m.id=gm.member_id WHERE gm.member_id=? AND g.workspace_id=m.workspace_id').bind(ctx.actor.id).all<{id:string}>(),ctx.db.prepare('SELECT cm.container_id AS id FROM container_members cm JOIN containers c ON c.id=cm.container_id JOIN members m ON m.id=cm.member_id WHERE cm.member_id=? AND c.workspace_id=m.workspace_id UNION SELECT co.container_id AS id FROM container_owners co JOIN containers c ON c.id=co.container_id JOIN members m ON m.id=co.member_id WHERE co.member_id=? AND c.workspace_id=m.workspace_id').bind(ctx.actor.id,ctx.actor.id).all<{id:string}>()]);
  return {memberId:ctx.actor.id,workspaceId:ctx.actor.workspaceId,status:row.status,isGuest:row.member_kind==='guest',groupIds:groups.results.map(r=>r.id),containerIds:containers.results.map(r=>r.id)};
}
export async function resolveCurrentAccess(ctx:FeatureContext,pageId:string,options:AccessResolutionOptions={}):Promise<CurrentAccess> {
  const subject=await currentSubject(ctx);
  const page=await ctx.db.prepare('SELECT id,workspace_id AS workspaceId,container_id AS containerId,parent_page_id AS parentId,lifecycle,trashed_at AS trashedAt,author_member_id AS authorMemberId,access_inheritance AS inheritance FROM pages WHERE id=? AND workspace_id=? AND deleted_at IS NULL').bind(pageId,ctx.actor.workspaceId).first<{id:string;workspaceId:string;containerId:string;parentId:string|null;trashedAt:string|null;lifecycle:PageLifecycle;authorMemberId:string;inheritance:string}>();
  if (!page || (page.trashedAt&&!options.includeTrashed)) throw new ApiProblem(404,'NOT_FOUND','Not found.');
  const location=options.locationOverrides?.[pageId];if(location){page.containerId=location.containerId;page.parentId=location.parentPageId;}
  if(page.lifecycle==='archived'){const prior=await ctx.db.prepare('SELECT prior_lifecycle FROM content_archive_locations WHERE page_id=?').bind(pageId).first<{prior_lifecycle:PageLifecycle}>();if(prior&&(prior.prior_lifecycle==='draft'||prior.prior_lifecycle==='scheduled'))page.lifecycle=prior.prior_lifecycle;}
  const container=await ctx.db.prepare('SELECT c.id,c.workspace_id AS workspaceId,c.visibility,c.trashed_at AS trashedAt,CASE WHEN c.guest_access="forbidden" OR w.guest_access="forbidden" THEN "forbidden" ELSE "allowed" END AS guests,CASE WHEN c.public_link_access="forbidden" OR w.public_link_access="forbidden" THEN "forbidden" ELSE "allowed" END AS publicLinks,CASE WHEN c.anonymous_access="forbidden" OR w.anonymous_access="forbidden" THEN "forbidden" ELSE "allowed" END AS anonymous FROM containers c JOIN workspaces w ON w.id=c.workspace_id WHERE c.id=?').bind(page.containerId).first<{id:string;workspaceId:string;visibility:string;trashedAt:string|null;guests:'allowed'|'forbidden';publicLinks:'allowed'|'forbidden';anonymous:'allowed'|'forbidden'}>();
  if (!container || (container.trashedAt&&!options.includeTrashed)) throw new ApiProblem(404,'NOT_FOUND','Not found.');
  if(container.visibility==='personal' && !await ctx.db.prepare('SELECT 1 FROM container_owners WHERE container_id=? AND member_id=?').bind(container.id,ctx.actor.id).first()) throw new ApiProblem(404,'NOT_FOUND','Not found.');
  const [own,cg]=await Promise.all([grants(ctx.db,'page_grants','page_id',pageId),grants(ctx.db,'container_grants','container_id',container.id)]);
  const inherited:KnowledgeGrant[]=[]; const seen=new Set([page.id]); let parent=page.parentId;
  let blocked=page.inheritance==='restricted';
  while(parent && !blocked) {
    if(seen.has(parent)) throw new ApiProblem(409,'TREE_CYCLE','The page tree contains a cycle.'); seen.add(parent);
    const ancestor=await ctx.db.prepare('SELECT parent_page_id AS parentId,container_id AS containerId,access_inheritance AS inheritance FROM pages WHERE id=? AND workspace_id=? AND deleted_at IS NULL').bind(parent,ctx.actor.workspaceId).first<{parentId:string|null;containerId:string;inheritance:string}>();
    if(!ancestor) throw new ApiProblem(404,'NOT_FOUND','Not found.');
    const ancestorLocation=options.locationOverrides?.[parent];if(ancestorLocation){ancestor.containerId=ancestorLocation.containerId;ancestor.parentId=ancestorLocation.parentPageId;}
    if(ancestor.containerId!==container.id)throw new ApiProblem(404,'NOT_FOUND','Not found.');
    inherited.push(...(await grants(ctx.db,'page_grants','page_id',parent)).results);
    blocked=ancestor.inheritance==='restricted'; parent=ancestor.parentId;
  }
  // Guests and personal containers never acquire workspace-wide or container-general access.
  const eligible=(g:KnowledgeGrant)=> !(subject.isGuest && (g.principalKind==='workspace'||g.principalKind==='container')) && !(container.visibility==='personal' && (g.principalKind==='workspace'||g.principalKind==='container'));
  const context:PageAccessContext={page:{...page,restricted:page.inheritance==='restricted',grants:own.results.filter(eligible)},container:{id:container.id,workspaceId:container.workspaceId,grants:blocked?[]:cg.results.filter(eligible),externalAccess:{guests:container.guests,publicLinks:container.publicLinks,anonymous:container.anonymous}},inheritedGrants:inherited.filter(eligible)};
  return {subject,context,decision:evaluatePageAccess(subject,context,ctx.now)};
}
export async function requirePageLevel(ctx:FeatureContext,pageId:string,level:AccessLevel,options:AccessResolutionOptions={}):Promise<CurrentAccess> {
  const access=await resolveCurrentAccess(ctx,pageId,options); if(!can(access.decision,level)) throw new ApiProblem(404,'NOT_FOUND','Not found.'); return access;
}
export async function requireWorkspaceOwner(ctx:FeatureContext):Promise<void> {
  await currentSubject(ctx);
  const owner=await ctx.db.prepare("SELECT id FROM members WHERE id=? AND workspace_id=? AND role='owner' AND member_kind='member' AND status='active'").bind(ctx.actor.id,ctx.actor.workspaceId).first();
  if(!owner) throw new ApiProblem(403,'FORBIDDEN','A workspace owner is required.');
}
/** CONT-009 and WORK-008: a container's administrator, or a workspace owner for
 * any container that is not someone's personal space, administers its access. */
export async function requireContainerAdministration(ctx:FeatureContext,containerId:string):Promise<void> {
  try { await requireContainerLevel(ctx,containerId,'full'); }
  catch(cause) {
    if(!(cause instanceof ApiProblem)||cause.status!==404)throw cause;
    const row=await ctx.db.prepare('SELECT visibility FROM containers WHERE id=? AND workspace_id=?').bind(containerId,ctx.actor.workspaceId).first<{visibility:string}>();
    if(!row||row.visibility==='personal')throw cause;
    await requireWorkspaceOwner(ctx);
  }
}
export async function requireContainerLevel(ctx:FeatureContext,containerId:string,level:AccessLevel):Promise<void> {
  await requireImportPublication(ctx,containerId);
  const subject=await currentSubject(ctx);
  const row=await ctx.db.prepare('SELECT c.visibility,c.guest_access,w.guest_access AS workspace_guests FROM containers c JOIN workspaces w ON w.id=c.workspace_id WHERE c.id=? AND c.workspace_id=?').bind(containerId,ctx.actor.workspaceId).first<{visibility:string;guest_access:string;workspace_guests:string}>();
  if(!row || (subject.isGuest&&(row.guest_access==='forbidden'||row.workspace_guests==='forbidden'))) throw new ApiProblem(404,'NOT_FOUND','Not found.');
  const owner=await ctx.db.prepare('SELECT 1 FROM container_owners WHERE container_id=? AND member_id=?').bind(containerId,ctx.actor.id).first();
  if(owner) return;
  if(row.visibility==='personal') throw new ApiProblem(404,'NOT_FOUND','Not found.');
  const available=(await grants(ctx.db,'container_grants','container_id',containerId)).results.filter(g=>!g.revokedAt&&(!g.expiresAt||g.expiresAt>ctx.now));
  const rank={view:1,comment:2,edit:3,full:4};
  const match=available.some(g=>rank[g.level]>=rank[level]&&(g.principalKind==='member'?g.principalId===ctx.actor.id:g.principalKind==='group'?subject.groupIds.includes(g.principalId):!subject.isGuest&&row.visibility!=='personal'&&(g.principalKind==='workspace'?g.principalId===ctx.actor.workspaceId:subject.containerIds.includes(g.principalId))));
  if(!match) throw new ApiProblem(404,'NOT_FOUND','Not found.');
}

export { resolveCurrentAccessMany } from "./bulk-access";
