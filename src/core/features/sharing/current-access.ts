import {publishedImportContainerSql} from '../imports/publication';
import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import type { AccessLevel, KnowledgeGrant, MemberSubject } from '../../shared/knowledge/model';
import { can, type AccessDecision, type PageAccessContext } from './access';
import { resolveCurrentAccessMany } from './bulk-access';
export interface AccessResolutionOptions { includeTrashed?:boolean; locationOverrides?:Record<string,{containerId:string;parentPageId:string|null}> }
export interface CurrentAccess { subject: MemberSubject; context: PageAccessContext; decision: AccessDecision }
const grants = (db:D1Database, table:'page_grants'|'container_grants', key:string, id:string) => db.prepare(`SELECT id,principal_kind AS principalKind,principal_id AS principalId,level,expires_at AS expiresAt,revoked_at AS revokedAt FROM ${table} WHERE ${key}=?`).bind(id).all<KnowledgeGrant>();
const pendingSubjects=new WeakMap<FeatureContext,{memberId:string;workspaceId:string;promise:Promise<MemberSubject>}>();
/** Coalesce simultaneous reads only. Completed reads are never cached. */
export function currentSubject(ctx:FeatureContext):Promise<MemberSubject> {
  const pending=pendingSubjects.get(ctx);
  if(pending?.memberId===ctx.actor.id && pending.workspaceId===ctx.actor.workspaceId)return pending.promise;
  const entry={memberId:ctx.actor.id,workspaceId:ctx.actor.workspaceId,promise:readCurrentSubject(ctx)};
  pendingSubjects.set(ctx,entry);
  const clear=()=>{if(pendingSubjects.get(ctx)===entry)pendingSubjects.delete(ctx);};
  void entry.promise.then(clear,clear);
  return entry.promise;
}
async function readCurrentSubject(ctx:FeatureContext):Promise<MemberSubject> {
  // One statement gives status, epoch and both membership sets the same read boundary.
  const row=await ctx.db.prepare(`SELECT m.status,m.member_kind,m.guest_expires_at AS guestExpiresAt,(SELECT epoch FROM core_acl_epoch WHERE id=1) AS epoch,
    (SELECT json_group_array(id) FROM (SELECT gm.group_id AS id FROM group_members gm JOIN groups g ON g.id=gm.group_id WHERE gm.member_id=m.id AND g.workspace_id=m.workspace_id)) AS groups,
    (SELECT json_group_array(id) FROM (
      SELECT cm.container_id AS id FROM container_members cm JOIN containers c ON c.id=cm.container_id WHERE cm.member_id=m.id AND c.workspace_id=m.workspace_id
      UNION SELECT co.container_id AS id FROM container_owners co JOIN containers c ON c.id=co.container_id WHERE co.member_id=m.id AND c.workspace_id=m.workspace_id
    )) AS containers FROM members m WHERE m.id=? AND m.workspace_id=?`)
    .bind(ctx.actor.id,ctx.actor.workspaceId).first<{status:MemberSubject['status'];member_kind:string;guestExpiresAt:string|null;epoch:number;groups:string;containers:string}>();
  if(!row||row.status!=='active'||row.member_kind==='guest'&&row.guestExpiresAt!==null&&row.guestExpiresAt<=ctx.now)throw new ApiProblem(401,'UNAUTHENTICATED','An active, unexpired membership is required.');
  ctx.authorizationEpoch??=row.epoch;
  return {memberId:ctx.actor.id,workspaceId:ctx.actor.workspaceId,status:row.status,isGuest:row.member_kind==='guest',groupIds:JSON.parse(row.groups),containerIds:JSON.parse(row.containers)};
}
export async function resolveCurrentAccess(ctx:FeatureContext,pageId:string,options:AccessResolutionOptions={}):Promise<CurrentAccess> {
  const access=(await resolveCurrentAccessMany(ctx,[pageId],options)).get(pageId);
  if(!access)throw new ApiProblem(404,'NOT_FOUND','Not found.');
  return access;
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
  const [subject,row,available]=await Promise.all([
    currentSubject(ctx),
    ctx.db.prepare(`SELECT c.visibility,c.guest_access,w.guest_access AS workspace_guests,EXISTS(SELECT 1 FROM container_owners WHERE container_id=c.id AND member_id=?) AS owned FROM containers c JOIN workspaces w ON w.id=c.workspace_id WHERE c.id=? AND c.workspace_id=? AND ${publishedImportContainerSql('c.id')}`).bind(ctx.actor.id,containerId,ctx.actor.workspaceId).first<{visibility:string;guest_access:string;workspace_guests:string;owned:number}>(),
    grants(ctx.db,'container_grants','container_id',containerId)
  ]);
  if(!row || (subject.isGuest&&(row.guest_access==='forbidden'||row.workspace_guests==='forbidden')))throw new ApiProblem(404,'NOT_FOUND','Not found.');
  if(row.owned)return;
  if(row.visibility==='personal')throw new ApiProblem(404,'NOT_FOUND','Not found.');
  const live=available.results.filter(g=>!g.revokedAt&&(!g.expiresAt||g.expiresAt>ctx.now));
  const rank={view:1,comment:2,edit:3,full:4};
  const match=live.some(g=>rank[g.level]>=rank[level]&&(g.principalKind==='member'?g.principalId===ctx.actor.id:g.principalKind==='group'?subject.groupIds.includes(g.principalId):!subject.isGuest&&row.visibility!=='personal'&&(g.principalKind==='workspace'?g.principalId===ctx.actor.workspaceId:subject.containerIds.includes(g.principalId))));
  if(!match) throw new ApiProblem(404,'NOT_FOUND','Not found.');
}

export { resolveCurrentAccessMany };
