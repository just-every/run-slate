import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {commitOperation,mutationGuard} from '../../app/operations';
import {createUlid} from '../../shared/ulid';
import {identityRevision} from '../workspace/revisions';
import {parseImport} from './service';
import {prepareAppendImport} from './append';
import {prepareImportPlan} from './persist';
import {readImport} from './jobs';
import {finishDocumentIndex} from './legacy-index';
/** Documents keep their atomic native publication and existing receipt. Search
 * completion is a separate resumable projection of those exact affected IDs. */
export async function runLegacyImport(ctx:FeatureContext,id:string){
 const job=await readImport(ctx,id);
 if(job.state==='completed')return job;
 if(job.state==='indexing')return finishDocumentIndex(ctx,job);
 if(job.state==='deleted')throw new ApiProblem(409,'IMPORT_DELETED','This archive has been deleted.');
 const original=await ctx.files.get(job.archive_key);if(!original)throw new ApiProblem(409,'IMPORT_ARCHIVE_MISSING','The retained archive is missing.');
 const claim=createUlid();await ctx.db.batch([mutationGuard(ctx.db,"SELECT state IN ('queued','failed') FROM federation_imports WHERE id=?",[id]),ctx.db.prepare("UPDATE federation_imports SET state='running',revision_id=?,updated_at=? WHERE id=?").bind(claim,ctx.now,id)]);
 let stagedKeys:string[]=[];
 try{
  const parsed=parseImport(job.format,{name:job.filename,bytes:new Uint8Array(await original.arrayBuffer())});
  const target=job.destination_page_id?{pageId:job.destination_page_id,expectedRevisionId:job.expected_page_revision_id!}:undefined;
  const plan=target&&job.destination_mode==='append'?await prepareAppendImport(ctx,id,parsed,target):await prepareImportPlan(ctx,id,parsed,target);stagedKeys=plan.stagedKeys;
  await commitOperation(ctx,{operationKey:`import-publish:${id}`,action:'imports.publish',request:{id,hash:job.request_hash},authorize:plan.authorize,prepare:async({revisionId})=>({entity:{id,kind:'import',revisionId},value:{id,state:'indexing',counts:plan.counts,report:parsed.report},statements:[await identityRevision(ctx,revisionId,'import',id,{state:'indexing',counts:plan.counts}),mutationGuard(ctx.db,"SELECT revision_id=? AND state='running' FROM federation_imports WHERE id=?",[claim,id]),...plan.statements,ctx.db.prepare("UPDATE federation_imports SET state='indexing',progress_json=?,report_json=?,counts_json=?,revision_id=?,updated_at=? WHERE id=?").bind(JSON.stringify({phase:'indexing',pageIds:plan.pageIds,checkpoint:0,total:plan.pageIds.length}),JSON.stringify(parsed.report),JSON.stringify(plan.counts),revisionId,ctx.now,id)]})});
 }catch(error){
  for(const key of stagedKeys)await ctx.files.delete(key);
  await ctx.db.prepare("UPDATE federation_imports SET state='failed',report_json=?,updated_at=? WHERE id=? AND state='running' AND revision_id=?").bind(JSON.stringify({failure:error instanceof ApiProblem?error.code:'IMPORT_FAILED',message:error instanceof ApiProblem?error.message:'Archive could not be committed. Original archive retained.'}),ctx.now,id,claim).run();throw error;
 }
 return finishDocumentIndex(ctx,await readImport(ctx,id));
}
