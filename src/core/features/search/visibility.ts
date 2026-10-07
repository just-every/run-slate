import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { currentSubject, requireContainerLevel, requirePageLevel, requireWorkspaceOwner } from '../sharing/current-access';
export async function permitted(check:()=>Promise<unknown>):Promise<boolean> { try { await check(); return true; } catch(error) { if(error instanceof ApiProblem && (error.status===404||error.status===403)) return false; throw error; } }
export async function readableTarget(ctx:FeatureContext,kind:string,id:string):Promise<boolean> {
  if(['page','record','database','revision','page-status'].includes(kind)) {
    let pageId=id;
    if(kind==='database') pageId=(await ctx.db.prepare('SELECT page_id FROM databases WHERE id=?').bind(id).first<{page_id:string}>())?.page_id??id;
    if(kind==='revision') pageId=(await ctx.db.prepare('SELECT page_id FROM page_revisions WHERE id=?').bind(id).first<{page_id:string}>())?.page_id??'';
    return permitted(()=>requirePageLevel(ctx,pageId,'view'));
  }
  if(kind==='container') return permitted(()=>requireContainerLevel(ctx,id,'view'));
  if(kind==='comment'||kind==='comment-thread') {
    const row=await ctx.db.prepare(kind==='comment'?'SELECT t.page_id FROM comments c JOIN comment_threads t ON t.id=c.thread_id WHERE c.id=? AND c.deleted_at IS NULL':'SELECT page_id FROM comment_threads WHERE id=?').bind(id).first<{page_id:string}>();
    return !!row&&permitted(()=>requirePageLevel(ctx,row.page_id,'view'));
  }
  if(kind==='template') {
    const row=await ctx.db.prepare('SELECT container_id FROM knowledge_templates WHERE id=? AND workspace_id=? AND deleted_at IS NULL').bind(id,ctx.actor.workspaceId).first<{container_id:string|null}>();
    if(!row)return false;
    if(row.container_id)return permitted(()=>requireContainerLevel(ctx,row.container_id!,'view'));
    return !(await currentSubject(ctx)).isGuest;
  }
  if(kind==='decision') {
    const row=await ctx.db.prepare('SELECT page_id FROM knowledge_decisions WHERE id=? AND workspace_id=? AND removed_at IS NULL').bind(id,ctx.actor.workspaceId).first<{page_id:string}>();
    return !!row&&permitted(()=>requirePageLevel(ctx,row.page_id,'view'));
  }
  if(['preferences','saved-search','favourite','watch','recent','notification'].includes(kind))return id===ctx.actor.id;
  // Unknown targets never inherit workspace readability. Their owning feature must supply an ACL resolver.
  return ['workspace','member','group','invitation','chat-connection'].includes(kind)&&permitted(()=>requireWorkspaceOwner(ctx));
}
export async function currentPageTitle(ctx:FeatureContext,id:string):Promise<string>{
 const access=await requirePageLevel(ctx,id,'view');const row=await ctx.db.prepare('SELECT p.title,p.working_revision_id,p.published_revision_id,r.properties_json FROM pages p LEFT JOIN page_revisions r ON r.id=p.published_revision_id AND r.deleted_at IS NULL WHERE p.id=?').bind(id).first<{title:string;working_revision_id:string;published_revision_id:string|null;properties_json:string|null}>();if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');
 if(!['edit','full'].includes(access.decision.level!)&&row.published_revision_id&&row.published_revision_id!==row.working_revision_id){if(!row.properties_json)throw new ApiProblem(404,'NOT_FOUND','Not found.');return (JSON.parse(row.properties_json) as {title:string}).title;}return row.title;
}
