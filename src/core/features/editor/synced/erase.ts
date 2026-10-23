import type {FeatureContext} from '../../../app/feature-context';
import type {BlockView} from '../../../shared/api/content';
import {mutationGuard} from '../../../app/operations';
import {ApiProblem} from '../../../app/problems';
import {createUlid} from '../../../shared/ulid';
import {can} from '../../sharing/access';
import {resolveCurrentAccessMany} from '../../sharing/current-access';
import {pageRow,pageBlocks,revisionRow,revisionStatement,properties,contentEvent,snapshotHash} from '../../pages/repository';
/** Detach every retained copy in the deletion transaction; never publish a source's working draft. */
export async function detachSyncedSources(ctx:FeatureContext,pageIds:string[]){
 if(!pageIds.length)return [];
 const gone=new Set(pageIds),encoded=JSON.stringify(pageIds),statements:D1PreparedStatement[]=[];
 const current=(await ctx.db.prepare("SELECT b.* FROM page_blocks b JOIN pages p ON p.id=b.page_id WHERE p.workspace_id=? AND p.deleted_at IS NULL AND b.block_type='synced-reference' AND json_extract(b.content_json,'$.sourcePageId') IN (SELECT value FROM json_each(?)) AND b.page_id NOT IN (SELECT value FROM json_each(?))").bind(ctx.actor.workspaceId,encoded,encoded).all<Record<string,any>>()).results;
 const histories=(await ctx.db.prepare("SELECT r.* FROM page_revisions r JOIN pages p ON p.id=r.page_id WHERE p.workspace_id=? AND p.deleted_at IS NULL AND r.deleted_at IS NULL AND r.page_id NOT IN (SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM json_each(r.body_json) b WHERE json_extract(b.value,'$.blockType')='synced-reference' AND json_extract(b.value,'$.content.sourcePageId') IN (SELECT value FROM json_each(?)))").bind(ctx.actor.workspaceId,encoded,encoded).all<Record<string,any>>()).results;
 if(!current.length&&!histories.length)return statements;
 const audienceRefs=[...current.map(row=>({page_id:row.page_id,sourcePageId:JSON.parse(row.content_json).sourcePageId})),...histories.flatMap(row=>(JSON.parse(row.body_json) as BlockView[]).filter(b=>b.blockType==='synced-reference'&&gone.has((b.content as any).sourcePageId)).map(b=>({page_id:row.page_id,sourcePageId:(b.content as any).sourcePageId})))];
 const sourceIds=[...new Set(audienceRefs.map(row=>row.sourcePageId))];
 const sources=new Map<string,{text:unknown[];title:string}>();
 for(const pageId of sourceIds){
  const p=await pageRow(ctx,pageId);
  if(p.published_revision_id!==p.working_revision_id)throw new ApiProblem(409,'SYNCED_UNPUBLISHED','Restore and publish the source’s latest changes before permanently deleting it.');
  const snapshots=(await ctx.db.prepare('SELECT body_json,properties_json FROM page_revisions WHERE page_id=? AND deleted_at IS NULL ORDER BY created_at DESC,id DESC').bind(pageId).all<{body_json:string;properties_json:string}>()).results;
  for(const snapshot of snapshots)for(const b of JSON.parse(snapshot.body_json) as BlockView[])if(b.blockType==='synced-source'&&!sources.has(`${pageId}:${b.id}`))sources.set(`${pageId}:${b.id}`,{text:(b.content as {text:unknown[]}).text,title:JSON.parse(snapshot.properties_json).title});
  statements.push(mutationGuard(ctx.db,'SELECT revision_id=? AND working_revision_id=? AND published_revision_id IS ? AND trashed_at IS ? AND archived_at IS ? AND deleted_at IS NULL FROM pages WHERE id=?',[p.revision_id,p.working_revision_id,p.published_revision_id,p.trashed_at,p.archived_at,pageId]));
 }
 const destinations=[...new Set([...current.map(b=>b.page_id),...histories.map(r=>r.page_id)])];
 // Static content must not create a new audience merely because the source was erased.
 const people=(await ctx.db.prepare("SELECT id FROM members WHERE workspace_id=? AND status='active'").bind(ctx.actor.workspaceId).all<{id:string}>()).results;
 for(const person of people){
  const viewer={...ctx,actor:{...ctx.actor,id:person.id},authorizationEpoch:undefined};
  let access:Awaited<ReturnType<typeof resolveCurrentAccessMany>>;
  try{access=await resolveCurrentAccessMany(viewer,[...sourceIds,...destinations],{includeTrashed:true});}catch(error){if(error instanceof ApiProblem&&error.status===401)continue;throw error;}
  const visible=(id:string)=>{const decision=access.get(id)?.decision;return !!decision&&can(decision,'view');};
  for(const row of audienceRefs){const source=row.sourcePageId;if(visible(row.page_id)&&!visible(source))throw new ApiProblem(409,'SYNCED_COPY_AUDIENCE','Some copies have readers without source access. Remove those copies or narrow their sharing before permanently deleting the source.');}
 }
 const publicSql="EXISTS(SELECT 1 FROM public_exposures e JOIN pages p ON p.id=e.page_id JOIN containers c ON c.id=p.container_id JOIN workspaces w ON w.id=p.workspace_id WHERE e.page_id=? AND e.revoked_at IS NULL AND p.published_revision_id IS NOT NULL AND c.public_link_access='allowed' AND c.anonymous_access='allowed' AND w.public_link_access='allowed' AND w.anonymous_access='allowed')";
 const exposureStates=new Map<string,boolean>();
 for(const id of [...new Set([...sourceIds,...destinations])]){const value=!!(await ctx.db.prepare('SELECT '+publicSql+' AS value').bind(id).first<{value:number}>())?.value;exposureStates.set(id,value);statements.push(mutationGuard(ctx.db,'SELECT ('+publicSql+')=?',[id,+value]));}
 for(const row of audienceRefs)if(exposureStates.get(row.page_id)&&!exposureStates.get(row.sourcePageId))throw new ApiProblem(409,'SYNCED_COPY_AUDIENCE','Remove publicly exposed copies before deleting a private synced source.');
 const convert=(block:BlockView):BlockView=>{
  if(block.blockType!=='synced-reference'||!gone.has((block.content as any).sourcePageId))return block;
  const c=block.content as {sourcePageId:string;sourceBlockId:string},source=sources.get(`${c.sourcePageId}:${c.sourceBlockId}`);
  if(!source)throw new ApiProblem(409,'SYNCED_SOURCE_UNAVAILABLE','A retained synced source is unavailable. Remove its copies before deleting it.');
  return {...block,blockType:'paragraph',revisionId:createUlid(),content:{text:[...source.text,{text:`\nSource: ${source.title}`}]} as BlockView['content']};
 };
 statements.push(mutationGuard(ctx.db,"SELECT COUNT(*)=? FROM page_blocks WHERE block_type='synced-reference' AND json_extract(content_json,'$.sourcePageId') IN (SELECT value FROM json_each(?)) AND page_id NOT IN (SELECT value FROM json_each(?))",[current.length,encoded,encoded]));
 statements.push(mutationGuard(ctx.db,"SELECT COUNT(*)=? FROM page_revisions r JOIN pages p ON p.id=r.page_id WHERE p.workspace_id=? AND p.deleted_at IS NULL AND r.deleted_at IS NULL AND r.page_id NOT IN (SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM json_each(r.body_json) b WHERE json_extract(b.value,'$.blockType')='synced-reference' AND json_extract(b.value,'$.content.sourcePageId') IN (SELECT value FROM json_each(?)))",[histories.length,ctx.actor.workspaceId,encoded,encoded]));
 for(const row of histories){const blocks=(JSON.parse(row.body_json) as BlockView[]).map(convert),props=JSON.parse(row.properties_json);statements.push(mutationGuard(ctx.db,'SELECT body_json=? AND properties_json=? AND deleted_at IS NULL FROM page_revisions WHERE id=?',[row.body_json,row.properties_json,row.id]),ctx.db.prepare('UPDATE page_revisions SET body_json=?,content_hash=? WHERE id=?').bind(JSON.stringify(blocks),await snapshotHash({blocks,properties:props}),row.id));}
 for(const id of destinations){
  const p=await pageRow(ctx,id),old=await pageBlocks(ctx.db,id),blocks=old.map(convert);
  if(!current.some(b=>b.page_id===id))continue;
  const revisionId=createUlid();
  statements.push(mutationGuard(ctx.db,'SELECT revision_id=? AND working_revision_id=? AND published_revision_id IS ? FROM pages WHERE id=?',[p.revision_id,p.working_revision_id,p.published_revision_id,id]));
  for(const b of old.filter(b=>b.blockType==='synced-reference'&&gone.has((b.content as any).sourcePageId))){const next=blocks.find(n=>n.id===b.id)!;statements.push(mutationGuard(ctx.db,'SELECT revision_id=? AND content_json=? FROM page_blocks WHERE id=?',[b.revisionId,JSON.stringify(b.content),b.id]),ctx.db.prepare('UPDATE page_blocks SET block_type=?,content_json=?,revision_id=?,updated_at=? WHERE id=?').bind(next.blockType,JSON.stringify(next.content),next.revisionId,ctx.now,b.id));}
  statements.push(await revisionStatement(ctx,id,revisionId,{blocks,properties:await properties(ctx,p)},'synced-source-deleted'),ctx.db.prepare('UPDATE pages SET working_revision_id=?,revision_id=?,published_revision_id=CASE WHEN published_revision_id=working_revision_id THEN ? ELSE published_revision_id END,updated_at=? WHERE id=?').bind(revisionId,revisionId,revisionId,ctx.now,id),...contentEvent(ctx,id,revisionId,'synced-source-deleted'));
 }
 return statements;
}
