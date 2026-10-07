import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { currentSubject, requireContainerLevel, requireWorkspaceOwner } from '../sharing/current-access';
interface ContainerMetadata { id:string; key:string|null; icon:string|null; name:string; description:string; visibility:string; guestAccess:'allowed'|'forbidden'; publicLinkAccess:'allowed'|'forbidden'; anonymousAccess:'allowed'|'forbidden'; revisionId:string; archivedAt:string|null; trashedAt:string|null; }
export async function readContainer(ctx:FeatureContext,id:string) {
    await currentSubject(ctx);
    const row=await ctx.db.prepare('SELECT id,key,icon,name,description,visibility,guest_access AS guestAccess,public_link_access AS publicLinkAccess,anonymous_access AS anonymousAccess,revision_id AS revisionId,archived_at AS archivedAt,trashed_at AS trashedAt FROM containers WHERE id=? AND workspace_id=?').bind(id,ctx.actor.workspaceId).first<ContainerMetadata>();
    if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');
    // Workspace administration never reveals another member's personal container.
    if(row.visibility==='personal'&&!await ctx.db.prepare('SELECT 1 FROM container_owners WHERE container_id=? AND member_id=?').bind(id,ctx.actor.id).first())throw new ApiProblem(404,'NOT_FOUND','Not found.');
    let canManage=false;
    try{await requireContainerLevel(ctx,id,'full');canManage=true;}catch(e){if(!(e instanceof ApiProblem)||e.status!==404)throw e;}
    if(!canManage&&row.visibility!=='personal')try{await requireWorkspaceOwner(ctx);canManage=true;}catch(e){if(!(e instanceof ApiProblem)||e.status!==403)throw e;}
    if(!canManage)await requireContainerLevel(ctx,id,'view');
    const count=await ctx.db.prepare('SELECT COUNT(*) AS count FROM container_members WHERE container_id=?').bind(id).first<{count:number}>();
    return {...row,memberCount:count!.count,permissions:{canManage}};
}
export async function containerIndex(ctx:FeatureContext, archived=false){
    if((await currentSubject(ctx)).isGuest)throw new ApiProblem(403,'FORBIDDEN','Guests have no container index.');
    const rows=(await ctx.db.prepare('SELECT id FROM containers WHERE workspace_id=? AND ((?=0 AND archived_at IS NULL AND trashed_at IS NULL) OR (?=1 AND (archived_at IS NOT NULL OR trashed_at IS NOT NULL))) ORDER BY name,id').bind(ctx.actor.workspaceId,+archived,+archived).all<{id:string}>()).results;
    const items=[];
    for(const row of rows)try{items.push(await readContainer(ctx,row.id));}catch(e){if(!(e instanceof ApiProblem)||e.status!==404)throw e;}
    return {items};
}
