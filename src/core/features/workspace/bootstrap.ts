import { defaultStatusStatements } from '../page-status/defaults';
import type { RuntimeConfig } from '../../platform/config/runtime';
import type { FeatureContext } from '../../app/feature-context';
import { createUlid } from '../../shared/ulid';
import { commitOperation, mutationGuard, requestHash } from '../../app/operations';
import { requireWorkspaceOwner, currentSubject } from '../sharing/current-access';
/** Configuration identifies the sole initial mailbox. The mailbox still must prove possession. */
export async function bootstrapOwner(db:D1Database,config:RuntimeConfig,email:string){
  if(email.toLowerCase()!==config.setupOwnerEmail?.toLowerCase())return;
  if(await db.prepare('SELECT id FROM workspaces LIMIT 1').first())return;
  const workspaceId=createUlid(),memberId=createUlid(),now=new Date().toISOString();
  try{await db.batch([mutationGuard(db,'SELECT count(*)=0 FROM workspaces',[]),db.prepare("INSERT INTO workspaces (id,name,mark,created_at,updated_at,revision_id) VALUES (?,'My workspace','',?,?,?)").bind(workspaceId,now,now,createUlid()),db.prepare("INSERT INTO members (id,workspace_id,email,display_name,initials,role,member_kind,status,is_setup_owner,created_at,updated_at) VALUES (?,?,?,?,'OW','owner','member','active',1,?,?)").bind(memberId,workspaceId,email.toLowerCase(),email.split('@')[0],now,now),...defaultStatusStatements(db,workspaceId,now)]);}catch(cause){if(!await db.prepare('SELECT id FROM workspaces LIMIT 1').first())throw cause;}
}
export async function firstRunState(ctx:FeatureContext){
 await currentSubject(ctx);
 const state=await ctx.db.prepare('SELECT w.first_run_completed_at,m.is_setup_owner,m.role FROM workspaces w JOIN members m ON m.workspace_id=w.id WHERE w.id=? AND m.id=?').bind(ctx.actor.workspaceId,ctx.actor.id).first<{first_run_completed_at:string|null;is_setup_owner:number;role:string}>();
 const required=!!state&&!state.first_run_completed_at&&state.is_setup_owner===1;
 return {required,canComplete:required&&state?.role==='owner'};
}
export async function completeFirstRun(ctx:FeatureContext,input:{operationKey:string;workspaceName:string;containerName:string;pageTitle:string}){
  return commitOperation(ctx,{operationKey:input.operationKey,action:'workspace.first-run',request:input,authorize:()=>requireWorkspaceOwner(ctx),prepare:async({revisionId})=>{
    const containerId=createUlid(),pageId=createUlid(),pageRevision=createUlid();
    const body='[]',properties=JSON.stringify({title:input.pageTitle});
    return {entity:{id:ctx.actor.workspaceId,kind:'workspace',revisionId},value:{workspaceId:ctx.actor.workspaceId,containerId,pageId,invitationStep:true},statements:[
      mutationGuard(ctx.db,'SELECT is_setup_owner=1 FROM members WHERE id=?',[ctx.actor.id]),
      mutationGuard(ctx.db,'SELECT first_run_completed_at IS NULL FROM workspaces WHERE id=?',[ctx.actor.workspaceId]),
      mutationGuard(ctx.db,'SELECT NOT EXISTS (SELECT 1 FROM containers WHERE workspace_id=?) AND NOT EXISTS (SELECT 1 FROM pages WHERE workspace_id=?)',[ctx.actor.workspaceId,ctx.actor.workspaceId]),
      ctx.db.prepare('UPDATE workspaces SET name=?,updated_at=?,revision_id=?,first_run_completed_at=? WHERE id=?').bind(input.workspaceName,ctx.now,revisionId,ctx.now,ctx.actor.workspaceId),
      ctx.db.prepare("INSERT INTO containers (id,workspace_id,name,visibility,created_at,updated_at,revision_id) VALUES (?,?,?,'default',?,?,?)").bind(containerId,ctx.actor.workspaceId,input.containerName,ctx.now,ctx.now,revisionId),
      ctx.db.prepare('INSERT INTO container_owners (container_id,member_id,created_at) VALUES (?,?,?)').bind(containerId,ctx.actor.id,ctx.now),
      ctx.db.prepare('INSERT INTO container_members (container_id,member_id,created_at) VALUES (?,?,?)').bind(containerId,ctx.actor.id,ctx.now),
      ctx.db.prepare("INSERT INTO container_grants (id,container_id,principal_kind,principal_id,level,created_at,updated_at) VALUES (?,?,'member',?,'full',?,?)").bind(createUlid(),containerId,ctx.actor.id,ctx.now,ctx.now),
      ctx.db.prepare("INSERT INTO pages (id,workspace_id,container_id,title,author_member_id,owner_member_id,lifecycle,working_revision_id,published_revision_id,created_at,updated_at,revision_id) VALUES (?,?,?,?,?,?,'live',?,?,?,?,?)").bind(pageId,ctx.actor.workspaceId,containerId,input.pageTitle,ctx.actor.id,ctx.actor.id,pageRevision,pageRevision,ctx.now,ctx.now,pageRevision),
      ctx.db.prepare("INSERT INTO page_grants (id,page_id,principal_kind,principal_id,level,created_at,updated_at) VALUES (?,?,'workspace',?,'view',?,?)").bind(createUlid(),pageId,ctx.actor.workspaceId,ctx.now,ctx.now),
      ctx.db.prepare("INSERT INTO page_revisions (id,page_id,author_member_id,origin,content_hash,body_json,properties_json,created_at) VALUES (?,?,?,'publish',?,?,?,?)").bind(pageRevision,pageId,ctx.actor.id,await requestHash({body:[],properties:{title:input.pageTitle}}),body,properties,ctx.now),
    ]};
  }});
}
