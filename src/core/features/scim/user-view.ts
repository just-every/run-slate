import type { ScimContext } from './context';
import { resource, nativeMember, type ResourceRow } from './storage';
import { USER, ScimError, listResponse, pagination, equalityFilter } from './protocol';
export async function userView(ctx:ScimContext,row:ResourceRow) {
  const member=await nativeMember(ctx,row.member_id);
  const active=row.state==='active'&&member?.status==='active';
  return {schemas:[USER],id:row.id,...(row.external_id===null?{}:{externalId:row.external_id}),userName:member?.email??row.user_name!,displayName:member?.display_name??row.display_name!,name:{formatted:member?.display_name??row.display_name!,...(row.given_name===null?{}:{givenName:row.given_name}),...(row.family_name===null?{}:{familyName:row.family_name})},emails:[{value:member?.email??row.user_name!,type:'work',primary:true}],active:!!active,meta:{resourceType:'User',created:row.created_at,lastModified:row.updated_at,location:`/scim/v2/Users/${row.id}`}};
}
export async function getUser(ctx:ScimContext,id:string) {return userView(ctx,await resource(ctx,'User',id));}
export async function listUsers(ctx:ScimContext,query:Record<string,string>) {
  if(query.sortBy||query.sortOrder)throw new ScimError(400,'Sorting is not supported.','invalidValue');
  const filter=equalityFilter(query.filter,'userName'),{startIndex,count}=pagination(query);
  const rows=(await ctx.db.prepare("SELECT r.* FROM scim_resources r LEFT JOIN members m ON m.id=r.member_id WHERE r.workspace_id=? AND r.resource_type='User' AND r.state!='deleted' AND (? IS NULL OR lower(COALESCE(m.email,r.user_name))=lower(?)) ORDER BY r.created_at,r.id").bind(ctx.actor.workspaceId,filter??null,filter??null).all<ResourceRow>()).results;
  // Authority changes never expose an Owner or guest through an old SCIM mapping.
  const allowed:ResourceRow[]=[];
  for(const row of rows){try{await nativeMember(ctx,row.member_id);allowed.push(row);}catch(cause){if(!(cause instanceof ScimError)||cause.status!==403)throw cause;}}
  return listResponse(await Promise.all(allowed.slice(startIndex-1,startIndex-1+count).map(row=>userView(ctx,row))),allowed.length,startIndex);
}
