import { createUlid } from '../../shared/ulid';
import { saveGroup } from '../workspace/groups';
import { nativeCommitContext, type ScimContext } from './context';
import { resource, resourceInsert, resourceUpdate, resourceGuard, nativeMember, targetGuard, type ResourceRow } from './storage';
import { GROUP, ScimError, listResponse, equalityFilter, pagination, reportIgnored } from './protocol';
import { parseGroup } from './group-input';
interface GroupRow {id:string;name:string;revision_id:string;created_at:string;updated_at:string}
async function nativeGroup(ctx:ScimContext,row:ResourceRow) {
  const group=await ctx.db.prepare('SELECT id,name,revision_id,created_at,updated_at FROM groups WHERE id=? AND workspace_id=?').bind(row.group_id,ctx.actor.workspaceId).first<GroupRow>();
  if(!group)throw new ScimError(404,'Group not found.');
  return group;
}
async function resolveMembers(ctx:ScimContext,ids:string[]) {
  const result:string[]=[];
  for(const id of new Set(ids)){
    const user=await resource(ctx,'User',id),member=await nativeMember(ctx,user.member_id);
    if(user.state!=='active'||!member||member.status!=='active')throw new ScimError(400,'Group members must be accepted, active native Members. Pending invitations cannot join a group.','invalidValue');
    result.push(member.id);
  }
  return result;
}
export async function groupView(ctx:ScimContext,row:ResourceRow) {
  const group=await nativeGroup(ctx,row);
  const members=(await ctx.db.prepare("SELECT r.id,m.display_name FROM group_members gm JOIN members m ON m.id=gm.member_id JOIN scim_resources r ON r.member_id=m.id AND r.resource_type='User' AND r.state='active' WHERE gm.group_id=? AND r.workspace_id=? AND m.status='active' AND m.member_kind='member' AND m.role='member' ORDER BY r.id").bind(group.id,ctx.actor.workspaceId).all<{id:string;display_name:string}>()).results;
  return {schemas:[GROUP],id:row.id,...(row.external_id===null?{}:{externalId:row.external_id}),displayName:group.name,members:members.map(member=>({value:member.id,$ref:`/scim/v2/Users/${member.id}`,display:member.display_name})),meta:{resourceType:'Group',created:row.created_at,lastModified:group.updated_at,location:`/scim/v2/Groups/${row.id}`}};
}
export async function getGroup(ctx:ScimContext,id:string) {return groupView(ctx,await resource(ctx,'Group',id));}
export async function listGroups(ctx:ScimContext,query:Record<string,string>) {
  if(query.sortBy||query.sortOrder)throw new ScimError(400,'Sorting is not supported.','invalidValue');
  const filter=equalityFilter(query.filter,'displayName'),{startIndex,count}=pagination(query);
  const rows=(await ctx.db.prepare("SELECT r.* FROM scim_resources r JOIN groups g ON g.id=r.group_id WHERE r.workspace_id=? AND r.resource_type='Group' AND r.state!='deleted' AND (? IS NULL OR lower(g.name)=lower(?)) ORDER BY r.created_at,r.id").bind(ctx.actor.workspaceId,filter??null,filter??null).all<ResourceRow>()).results;
  return listResponse(await Promise.all(rows.slice(startIndex-1,startIndex-1+count).map(row=>groupView(ctx,row))),rows.length,startIndex);
}
export async function writeGroup(ctx:ScimContext,body:Record<string,unknown>,id?:string) {
  const input=parseGroup(body),resourceId=id??createUlid();
  const previous=id?await resource(ctx,'Group',id):null,group=previous?await nativeGroup(ctx,previous):null,memberIds=await resolveMembers(ctx,input.members);
  const row:ResourceRow=previous?{...previous,external_id:input.externalId,display_name:input.displayName}:{id:resourceId,workspace_id:ctx.actor.workspaceId,resource_type:'Group',external_id:input.externalId,member_id:null,invitation_id:null,group_id:null,user_name:null,display_name:input.displayName,given_name:null,family_name:null,state:'active',created_at:ctx.now,updated_at:ctx.now};
  const before=[...(previous?[resourceGuard(ctx,previous)]:[]),...memberIds.map(memberId=>targetGuard(ctx,memberId))];
  const after=[previous?resourceUpdate(ctx,row):resourceInsert(ctx,row),...(!previous?[ctx.db.prepare('UPDATE scim_resources SET group_id=(SELECT target_id FROM operation_receipts WHERE workspace_id=? AND actor_member_id=? AND operation_key=?) WHERE id=?').bind(ctx.actor.workspaceId,ctx.actor.id,ctx.operationKey,row.id)]:[])];
  await saveGroup(nativeCommitContext(ctx,ctx.operationKey,before,after),{operationKey:ctx.operationKey,...(group?{id:group.id,expectedRevisionId:group.revision_id}:{}),name:input.displayName,memberIds});
  return reportIgnored(await groupView(ctx,await resource(ctx,'Group',row.id)),input.ignored);
}
export async function deleteGroup(ctx:ScimContext,id:string) {
  const row=await resource(ctx,'Group',id),group=await nativeGroup(ctx,row);
  await saveGroup(nativeCommitContext(ctx,ctx.operationKey,[resourceGuard(ctx,row)],[ctx.db.prepare("UPDATE scim_resources SET state='deleted',group_id=NULL,updated_at=? WHERE id=?").bind(ctx.now,row.id)]),{operationKey:ctx.operationKey,id:group.id,expectedRevisionId:group.revision_id,name:group.name,memberIds:[],remove:true});
}
