import {deletedReferenceStatements} from './deleted';
import type {FeatureContext} from '../../../app/feature-context';
import type {BlockView} from '../../../shared/api/content';
import {mutationGuard} from '../../../app/operations';
import {createUlid} from '../../../shared/ulid';
import {pageRow,pageBlocks,revisionRow,revisionStatement,properties,contentEvent} from '../../pages/repository';
import {frozenAudience,publicSql} from './audience';
/** New attributed revisions only. Retained historical references are never rewritten. */
export async function detachSyncedSources(ctx:FeatureContext,pageIds:string[],blockIds?:string[]){
 if(!pageIds.length)return [];
 const encoded=JSON.stringify(pageIds),statements:D1PreparedStatement[]=[...await deletedReferenceStatements(ctx,pageIds,blockIds)];
 const destinationsSql="SELECT DISTINCT p.id FROM pages p JOIN page_revisions r ON r.id=p.working_revision_id OR r.id=p.published_revision_id,json_each(r.body_json) b WHERE p.workspace_id=? AND p.deleted_at IS NULL AND p.id NOT IN (SELECT value FROM json_each(?)) AND json_extract(b.value,'$.blockType')='synced-reference' AND json_extract(b.value,'$.content.staticId') IS NULL AND json_extract(b.value,'$.content.sourcePageId') IN (SELECT value FROM json_each(?))";
 const destinations=(await ctx.db.prepare(destinationsSql).bind(ctx.actor.workspaceId,encoded,encoded).all<{id:string}>()).results;
 statements.push(mutationGuard(ctx.db,'SELECT COUNT(*)=? FROM ('+destinationsSql+')',[destinations.length,ctx.actor.workspaceId,encoded,encoded]));
 if(!destinations.length)return statements;
 const sources=new Map<string,{text:unknown[];title:string;draftOnly:boolean}>();
 for(const id of pageIds){
  const p=await pageRow(ctx,id),r=await revisionRow(ctx,id,p.published_revision_id??p.working_revision_id);
  for(const b of JSON.parse(r.body_json) as BlockView[])if(b.blockType==='synced-source')sources.set(`${id}:${b.id}`,{text:(b.content as {text:unknown[]}).text,title:JSON.parse(r.properties_json).title,draftOnly:false});
  if(p.published_revision_id&&p.published_revision_id!==p.working_revision_id){const working=await revisionRow(ctx,id,p.working_revision_id);for(const b of JSON.parse(working.body_json) as BlockView[])if(b.blockType==='synced-source'&&!sources.has(`${id}:${b.id}`))sources.set(`${id}:${b.id}`,{text:(b.content as {text:unknown[]}).text,title:JSON.parse(working.properties_json).title,draftOnly:true});}
  statements.push(mutationGuard(ctx.db,'SELECT revision_id=? AND working_revision_id=? AND published_revision_id IS ? FROM pages WHERE id=?',[p.revision_id,p.working_revision_id,p.published_revision_id,id]));
 }
 for(const {id} of destinations){
  const p=await pageRow(ctx,id),audiences=new Map<string,Awaited<ReturnType<typeof frozenAudience>>>();
  const matches=(b:BlockView)=>{const c=b.content as any;return b.blockType==='synced-reference'&&!c.staticId&&pageIds.includes(c.sourcePageId)&&(!blockIds||blockIds.includes(c.sourceBlockId));};
  const convert=async(blocks:BlockView[])=>Promise.all(blocks.map(async b=>{
   if(!matches(b))return b;
   const c=b.content as {sourcePageId:string;sourceBlockId:string},source=sources.get(`${c.sourcePageId}:${c.sourceBlockId}`);
   const audienceKey=`${c.sourcePageId}:${+!!source?.draftOnly}`;let audience=audiences.get(audienceKey);
   if(!audience){audience=await frozenAudience(ctx,c.sourcePageId,id,source?.draftOnly);audiences.set(audienceKey,audience);for(const target of [c.sourcePageId,id]){const state=!!(await ctx.db.prepare('SELECT '+publicSql+' AS value').bind(target).first<{value:number}>())?.value;statements.push(mutationGuard(ctx.db,'SELECT ('+publicSql+')=?',[target,+state]));}}
   if(source&&audience.ordinary)return {...b,blockType:'paragraph',revisionId:createUlid(),content:{text:[...source.text,{text:`\nSource: ${source.title}`}]}} as BlockView;
   const staticId=createUlid();
   statements.push(ctx.db.prepare('INSERT INTO synced_static_content VALUES (?,?,?,?,?,?,?,?,?)').bind(staticId,ctx.actor.workspaceId,id,b.id,JSON.stringify(source?.text??[]),source?.title??'',JSON.stringify(source?audience.readers:[]),+(!!source&&audience.anonymous),ctx.now));
   return {...b,revisionId:createUlid(),content:{...c,staticId}};
  }));
  const old=await pageBlocks(ctx.db,id),working=await convert(old);
  const changed=old.some(matches),published=p.published_revision_id&&p.published_revision_id!==p.working_revision_id?await revisionRow(ctx,id,p.published_revision_id):null;
  const publishedBlocks=published?JSON.parse(published.body_json) as BlockView[]:null;
  if(!changed&&!publishedBlocks?.some(matches))continue;
  statements.push(mutationGuard(ctx.db,'SELECT revision_id=? AND working_revision_id=? AND published_revision_id IS ? FROM pages WHERE id=?',[p.revision_id,p.working_revision_id,p.published_revision_id,id]));
  let workingId=p.working_revision_id,publishedId=p.published_revision_id;
  if(changed){
   workingId=createUlid();
   for(const b of working.filter((_,i)=>matches(old[i]!)))statements.push(ctx.db.prepare('UPDATE page_blocks SET block_type=?,content_json=?,revision_id=?,updated_at=? WHERE id=? AND page_id=?').bind(b.blockType,JSON.stringify(b.content),b.revisionId,ctx.now,b.id,id));
   statements.push(await revisionStatement(ctx,id,workingId,{blocks:working,properties:await properties(ctx,p)}));
   if(publishedId===p.working_revision_id)publishedId=workingId;
  }
  if(published&&publishedBlocks?.some(matches)){publishedId=createUlid();statements.push(await revisionStatement(ctx,id,publishedId,{blocks:await convert(publishedBlocks),properties:JSON.parse(published.properties_json)}));}
  const revisionId=changed?workingId:publishedId!;
  statements.push(ctx.db.prepare('UPDATE pages SET working_revision_id=?,published_revision_id=?,revision_id=?,updated_at=? WHERE id=?').bind(workingId,publishedId,revisionId,ctx.now,id),...contentEvent(ctx,id,revisionId,'synced-source-deleted'));
 }
 return statements;
}
