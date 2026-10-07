import { notificationStatements } from '../notifications/events';
import { identityRevision } from './revisions';
import type { FeatureContext } from '../../app/feature-context';
import { commitOperation, mutationGuard } from '../../app/operations';
import { requireWorkspaceOwner } from '../sharing/current-access';
import { createUlid } from '../../shared/ulid';
export async function listGroups(ctx:FeatureContext) {
  await requireWorkspaceOwner(ctx);
  const rows=await ctx.db.prepare('SELECT id,name,revision_id AS revisionId FROM groups WHERE workspace_id=? ORDER BY name,id').bind(ctx.actor.workspaceId).all<{id:string;name:string;revisionId:string}>();
  return {items:await Promise.all(rows.results.map(async row=>({...row,memberIds:(await ctx.db.prepare('SELECT member_id FROM group_members WHERE group_id=? ORDER BY member_id').bind(row.id).all<{member_id:string}>()).results.map(r=>r.member_id)})))};
}
export async function saveGroup(ctx:FeatureContext,input:{operationKey:string;id?:string;expectedRevisionId?:string;name:string;memberIds:string[];remove?:boolean}) {
  return commitOperation(ctx,{operationKey:input.operationKey,action:input.remove?'group.delete':'group.save',request:input,authorize:()=>requireWorkspaceOwner(ctx),prepare:async({revisionId})=>{
    const id=input.id??createUlid();
    const previous=(await ctx.db.prepare('SELECT member_id FROM group_members WHERE group_id=?').bind(id).all<{member_id:string}>()).results.map(r=>r.member_id);
    const statements:D1PreparedStatement[]=[];
    if(input.id) statements.push(mutationGuard(ctx.db,'SELECT revision_id=? FROM groups WHERE id=? AND workspace_id=?',[input.expectedRevisionId??'',id,ctx.actor.workspaceId]));
    if(input.remove) statements.push(ctx.db.prepare("DELETE FROM page_grants WHERE principal_kind='group' AND principal_id=?").bind(id),ctx.db.prepare("DELETE FROM container_grants WHERE principal_kind='group' AND principal_id=?").bind(id),ctx.db.prepare('DELETE FROM group_members WHERE group_id=?').bind(id),ctx.db.prepare('DELETE FROM groups WHERE id=?').bind(id));
    else {
      statements.push(ctx.db.prepare('INSERT INTO groups (id,workspace_id,name,created_at,updated_at,revision_id) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at,revision_id=excluded.revision_id').bind(id,ctx.actor.workspaceId,input.name,ctx.now,ctx.now,revisionId),ctx.db.prepare('DELETE FROM group_members WHERE group_id=?').bind(id));
      for(const memberId of new Set(input.memberIds)) statements.push(mutationGuard(ctx.db,"SELECT status='active' AND member_kind='member' FROM members WHERE id=? AND workspace_id=?",[memberId,ctx.actor.workspaceId]),ctx.db.prepare('INSERT INTO group_members (group_id,member_id,created_at) VALUES (?,?,?)').bind(id,memberId,ctx.now));
    }
    const added=input.memberIds.filter(id=>!previous.includes(id));
    if(!input.remove&&added.length){const targets=await ctx.db.prepare("SELECT 'page' AS kind,page_id AS id FROM page_grants WHERE principal_kind='group' AND principal_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?) UNION SELECT 'container' AS kind,container_id AS id FROM container_grants WHERE principal_kind='group' AND principal_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?)").bind(id,ctx.now,id,ctx.now).all<{kind:string;id:string}>();for(const target of targets.results)statements.push(...notificationStatements(ctx,{id:`${revisionId}:${target.kind}:${target.id}`,event:'access-granted',...(target.kind==='page'?{pageId:target.id}:{containerId:target.id}),recipientIds:added}));}
    statements.push(await identityRevision(ctx,revisionId,'group',id,{name:input.name,memberIds:input.memberIds,deleted:!!input.remove}));
    return {entity:{id,kind:'group',revisionId},value:{id,name:input.name,memberIds:input.memberIds,revisionId,deleted:!!input.remove},statements};
  }});
}
